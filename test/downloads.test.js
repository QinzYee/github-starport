import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile, access, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { Downloads, contained, validateDirectory, archiveEntries } from '../server/downloads.js';

async function setup(t, options = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'starport-download-'));
  const queue = new Downloads(path.join(dir, 'data'), options);
  await queue.init();
  t.after(async () => { await queue.saveChain; await rm(dir, { recursive: true, force: true }); });
  return { queue, directory: path.join(dir, 'repos'), dir };
}
async function idle(queue) {
  for (let i = 0; i < 300; i++) {
    if (!queue.running && !queue.jobs.some(j => j.status === 'queued')) { await queue.saveChain; return; }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('queue did not become idle');
}
test('队列限制并发为2，重复任务合并，下载文件出现在作者/仓库目录', async t => {
  let active = 0, peak = 0;
  const { queue, directory } = await setup(t, { runGit: async (repo, target) => {
    active++; peak = Math.max(peak, active);
    await mkdir(target, { recursive: true });
    await new Promise(resolve => setTimeout(resolve, 40));
    await writeFile(path.join(target, 'README.md'), repo);
    active--;
  } });
  const jobs = await queue.add({ directory, repositories: ['org/one', 'org/two', 'org/three', 'org/one'] });
  assert.equal(jobs.length, 3);
  const duplicate = await queue.add({ directory, repositories: ['org/one'] });
  assert.equal(duplicate[0].id, jobs[0].id);
  await idle(queue);
  assert.equal(peak, 2);
  assert.ok(queue.jobs.every(job => job.status === 'completed'));
  assert.equal(await readFile(path.join(directory, 'org', 'one', 'README.md'), 'utf8'), 'org/one');
});
test('已有目录跳过，保留其中原有文件', async t => {
  const { queue, directory } = await setup(t, { runGit: () => assert.fail('must never clone over an existing repo') });
  await mkdir(path.join(directory, 'org', 'project'), { recursive: true });
  await writeFile(path.join(directory, 'org', 'project', 'keep.txt'), 'do not overwrite');
  await queue.add({ directory, repositories: ['org/project'] });
  await idle(queue);
  assert.equal(queue.jobs[0].status, 'skipped');
  assert.equal(await readFile(path.join(directory, 'org', 'project', 'keep.txt'), 'utf8'), 'do not overwrite');
});
test('失败时清理独有临时目录，保留任务并支持重试', async t => {
  let targetPath;
  let fail = true;
  const { queue, directory } = await setup(t, { runGit: async (repo, target) => {
    targetPath = target;
    await mkdir(target, { recursive: true });
    if (fail) throw new Error('simulated network failure');
    await writeFile(path.join(target, 'file.txt'), 'ok');
  } });
  const [job] = await queue.add({ directory, repositories: ['org/project'] });
  await idle(queue);
  assert.equal(job.status, 'failed');
  await assert.rejects(access(targetPath));
  fail = false;
  await queue.retry(job.id);
  await idle(queue);
  assert.equal(queue.jobs[1].status, 'completed');
});
test('排队取消不启动，运行中的取消触发 AbortSignal', async t => {
  const invoked = [];
  const { queue, directory } = await setup(t, { runGit: async (repo, target, { signal }) => {
    invoked.push(repo);
    signal.throwIfAborted();
    await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } });
  queue.concurrency = 1;
  const jobs = await queue.add({ directory, repositories: ['org/one', 'org/two'] });
  for (let i = 0; i < 100 && !invoked.length; i++) await new Promise(resolve => setTimeout(resolve, 5));
  queue.cancel(jobs[1].id);
  queue.cancel(jobs[0].id);
  await idle(queue);
  assert.deepEqual(invoked, ['org/one']);
  assert.ok(jobs.every(job => job.status === 'cancelled'));
});
test('重启将运行中的历史任务标记中断', async t => {
  const { queue, dir } = await setup(t);
  queue.jobs = [{ id: 'saved', repo: 'org/project', status: 'running', path: path.join(dir, 'repos/org/project') }];
  queue.save(); await queue.saveChain;
  const restarted = new Downloads(queue.dataDir);
  await restarted.init();
  assert.equal(restarted.jobs[0].status, 'interrupted');
});
test('目录校验防止相对路径，路径边界不混淆同名前缀', () => {
  assert.throws(() => validateDirectory('../outside'));
  assert.throws(() => validateDirectory(''));
  const root = path.resolve('root');
  assert.equal(contained(root, path.join(root, 'org', 'repo')), true);
  assert.equal(contained(root, `${root}-outside`), false);
  assert.equal(contained(root, path.resolve(root, '../outside')), false);
});
test('作者目录 junction 指向目标之外时拒绝下载', async t => {
  const { queue, directory, dir } = await setup(t, { runGit: () => assert.fail('must never write through external junction') });
  const outside = path.join(dir, 'outside');
  await mkdir(directory); await mkdir(outside);
  try { await symlink(outside, path.join(directory, 'org'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') { t.skip('symlink permission unavailable'); return; } throw error; }
  await queue.add({ directory, repositories: ['org/project'] });
  await idle(queue);
  assert.equal(queue.jobs[0].status, 'failed');
  assert.match(queue.jobs[0].message, /目录之外/);
});
test('ZIP 解析阻止路径逃逸、符号链接、过大解压、多个根目录和设备名', () => {
  const target = path.resolve('test-root');
  const mock = name => ({ entryName: name, header: { attr: 0, size: 10 } });
  const zip = entries => ({ getEntries: () => entries });
  assert.throws(() => archiveEntries(zip([mock('root/../../escape')]), target), /不安全路径/);
  assert.throws(() => archiveEntries(zip([mock('root/NUL.txt')]), target), /文件名/);
  assert.throws(() => archiveEntries(zip([mock('root/a'), mock('other/b')]), target), /根目录/);
  assert.throws(() => archiveEntries(zip([{ ...mock('root/link'), header: { attr: 0xa0000000, size: 1 } }]), target), /符号链接/);
  assert.throws(() => archiveEntries(zip([{ ...mock('root/large'), header: { attr: 0, size: 601 * 1024 * 1024 } }]), target), /600 MB/);
  const valid = new AdmZip(); valid.addFile('repo-sha/README.md', Buffer.from('safe'));
  assert.equal(archiveEntries(valid, target)[0].dest, path.join(target, 'README.md'));
});
