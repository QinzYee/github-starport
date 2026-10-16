import { test } from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import { createBundle, safeEntries, bundleFilename, fetchSourceZip } from '../server/archive.js';

const sha = 'a'.repeat(40);
function codeloadZip(files, comment = sha) {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) zip.addFile(name, Buffer.from(content));
  zip.addZipComment(comment);
  return zip.toBuffer();
}
// 用真实的 Response 替换网络层，测试不依赖 GitHub 可达性。
function stubFetch(repositories) {
  const original = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async url => {
    const repo = String(url).match(/codeload\.github\.com\/([^/]+\/[^/]+)\/zip/)?.[1];
    seen.push(repo);
    const entry = repositories[repo];
    if (!entry) throw new Error(`意外的请求：${url}`);
    if (entry instanceof Error) throw entry;
    return new Response(entry, { status: 200 });
  };
  return { seen, restore: () => { globalThis.fetch = original; } };
}

test('打包按「作者/仓库」分层合并，并记录每个仓库的提交', async t => {
  const stub = stubFetch({
    'org/one': codeloadZip({ 'one-sha/README.md': 'one', 'one-sha/src/index.js': 'code' }),
    'org/two': codeloadZip({ 'two-sha/README.md': 'two' }, 'b'.repeat(40))
  });
  t.after(stub.restore);
  const { buffer, report, filename } = await createBundle(['org/one', 'org/two']);
  assert.deepEqual(report, [
    { repo: 'org/one', status: 'completed', sha, files: 2 },
    { repo: 'org/two', status: 'completed', sha: 'b'.repeat(40), files: 1 }
  ]);
  const names = new AdmZip(buffer).getEntries().map(entry => entry.entryName).sort();
  assert.deepEqual(names, ['org/one/README.md', 'org/one/src/index.js', 'org/two/README.md']);
  assert.match(filename, /^starport-\d{8}-\d{4}\.zip$/);
});

test('单个仓库失败不影响其余仓库，全部失败时明确报错', async t => {
  const stub = stubFetch({
    'org/one': codeloadZip({ 'one-sha/README.md': 'one' }),
    'org/two': new Error('network down')
  });
  t.after(stub.restore);
  const ok = await createBundle(['org/one', 'org/two']);
  assert.equal(ok.report[0].status, 'completed');
  assert.deepEqual(ok.report[1], { repo: 'org/two', status: 'failed', message: 'network down' });
  await assert.rejects(createBundle(['org/two']), /org\/two：network down/);
});

test('ZIP 条目校验阻止逃逸路径、多根目录与符号链接', () => {
  const zipOf = entries => {
    const zip = new AdmZip();
    for (const entry of entries) zip.addFile(entry, Buffer.from('x'));
    return zip;
  };
  assert.throws(() => safeEntries(zipOf(['one/a.md', 'two/b.md'])), /根目录/);
  // addFile 会规范化 ..，这里直接改写底层条目名以覆盖逃逸判断
  const escaping = zipOf(['one/a.md']);
  escaping.getEntries()[0].entryName = 'one/../../escape';
  assert.throws(() => safeEntries(escaping), /没有可用文件/);
  const link = zipOf(['one/link']);
  link.getEntries()[0].header.attr = 0xa0000000;
  assert.throws(() => safeEntries(link), /没有可用文件/);
  // 坏条目被跳过，好文件照常保留
  const mixed = zipOf(['one/keep.md', 'one/skip.md']);
  mixed.getEntries()[1].entryName = 'one/../skip.md';
  assert.deepEqual(safeEntries(mixed).map(entry => entry.relative), ['keep.md']);
});

test('源码包缺少可验证提交标识时拒绝打包', async t => {
  const stub = stubFetch({ 'org/one': codeloadZip({ 'one-sha/README.md': 'one' }, 'not-a-sha') });
  t.after(stub.restore);
  await assert.rejects(fetchSourceZip('org/one'), /可验证的 Git 提交标识/);
});

test('打包文件名使用北京时间', () => {
  // 2026-01-01T16:30:00Z 对应北京时间 2026-01-02 00:30
  assert.equal(bundleFilename(new Date('2026-01-01T16:30:00Z')), 'starport-20260102-0030.zip');
});

test('抓取超时按仓库报告失败，不拖到网关超时', async t => {
  const original = globalThis.fetch;
  // 模拟只连不动的上游：必须由超时中断，而不是一直挂着。
  globalThis.fetch = (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  });
  // AbortSignal.timeout 的定时器不保持事件循环，测试里需要自己撑住（真实服务由 HTTP 监听撑着）。
  const keepAlive = setTimeout(() => {}, 1000);
  t.after(() => { clearTimeout(keepAlive); globalThis.fetch = original; });
  await assert.rejects(createBundle(['org/hang'], { timeout: 120 }), /org\/hang：抓取超时/);
});

test('时间预算耗尽时逐个仓库说明原因，不留悬空请求', async () => {
  await assert.rejects(
    createBundle(['org/one', 'org/two'], { budget: 0 }),
    /org\/one：本次打包的时间预算已用完.*org\/two：本次打包的时间预算已用完/
  );
});
