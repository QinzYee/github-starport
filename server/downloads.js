import { spawn } from 'node:child_process';
import { mkdir, lstat, realpath, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { validRepo } from './github.js';
import { gitProxy } from './network.js';

const activeStates = new Set(['queued', 'running']);
export function contained(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
export function validateDirectory(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || /[\x00-\x1f]/.test(value) || value.length > 1000) throw new Error('请输入有效的本地绝对目录，如 F:\\Projects。');
  if (process.platform === 'win32' && (/^\\\\/.test(value) || /:/.test(value.slice(2)))) throw new Error('请使用本机磁盘目录，不支持网络路径或特殊设备路径。');
  return path.resolve(value);
}
async function exists(target) {
  try { await lstat(target); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export class Downloads {
  constructor(dataDir, { runGit, downloadZip } = {}) {
    this.dataDir = dataDir;
    this.jobs = [];
    this.concurrency = 2;
    this.running = 0;
    this.controllers = new Map();
    this.runGit = runGit || gitClone;
    this.downloadZip = downloadZip || sourceSnapshot;
    this.saveChain = Promise.resolve();
  }
  async init() {
    try { this.jobs = JSON.parse(await readFile(path.join(this.dataDir, 'downloads.json'), 'utf8')); } catch { this.jobs = []; }
    this.jobs = this.jobs.filter(j => j && validRepo(j.repo) && typeof j.id === 'string');
    for (const job of this.jobs) {
      if (activeStates.has(job.status)) { job.status = 'interrupted'; job.message = '服务已重启，请重试。'; }
    }
  }
  save() {
    const data = JSON.stringify(this.jobs.slice(-500));
    this.saveChain = this.saveChain.catch(() => {}).then(async () => {
      await mkdir(this.dataDir, { recursive: true });
      const file = path.join(this.dataDir, 'downloads.json');
      await writeFile(`${file}.tmp`, data);
      await rename(`${file}.tmp`, file);
    });
    this.saveChain.catch(error => console.error('下载记录保存失败：', error.message));
  }
  async add({ repositories, directory, shallow = true, method = 'git' }) {
    const base = validateDirectory(directory);
    if (!Array.isArray(repositories) || !repositories.length || repositories.length > 100 || !repositories.every(validRepo)) throw new Error('请选择 1–100 个有效的 GitHub 仓库。');
    if (!['git', 'zip'].includes(method)) throw new Error('下载方式无效。');
    await mkdir(base, { recursive: true });
    const root = await realpath(base);
    const added = [];
    for (const repo of new Set(repositories)) {
      const target = path.join(root, ...repo.split('/'));
      const comparable = process.platform === 'win32' ? target.toLowerCase() : target;
      const duplicate = this.jobs.find(j => (process.platform === 'win32' ? j.path.toLowerCase() : j.path) === comparable && activeStates.has(j.status));
      if (duplicate) { added.push(duplicate); continue; }
      const job = { id: randomUUID(), repo, directory: root, path: target, shallow: Boolean(shallow), method, status: 'queued', message: '等待下载', progress: 0, createdAt: new Date().toISOString(), logs: [] };
      this.jobs.push(job);
      added.push(job);
    }
    this.save();
    this.pump();
    return added;
  }
  cancel(id) {
    const job = this.jobs.find(j => j.id === id);
    if (!job || !activeStates.has(job.status)) throw new Error('任务不存在或已结束。');
    job.status = 'cancelled';
    job.message = '已取消';
    this.controllers.get(id)?.abort();
    this.save();
    return job;
  }
  async retry(id) {
    const job = this.jobs.find(j => j.id === id);
    if (!job || activeStates.has(job.status)) throw new Error('该任务无法重试。');
    return this.add({ repositories: [job.repo], directory: job.directory, shallow: job.shallow, method: job.method });
  }
  pump() {
    while (this.running < this.concurrency) {
      const job = this.jobs.find(j => j.status === 'queued');
      if (!job) return;
      this.running++;
      job.status = 'running';
      this.execute(job).catch(error => console.error(error.message)).finally(() => { this.running--; this.save(); this.pump(); });
    }
  }
  async execute(job) {
    const controller = new AbortController();
    this.controllers.set(job.id, controller);
    let staging;
    try {
      const root = await realpath(job.directory);
      const ownerPath = path.join(root, job.repo.split('/')[0]);
      await mkdir(ownerPath, { recursive: true });
      const owner = await realpath(ownerPath);
      if (!contained(root, owner)) throw new Error('作者目录指向目标目录之外，已停止下载。');
      const destination = path.join(owner, job.repo.split('/')[1]);
      if (!contained(root, destination)) throw new Error('仓库路径超出目标目录。');
      if (await exists(destination)) { job.status = 'skipped'; job.message = '目录已存在，已跳过'; return; }
      staging = path.join(owner, `.hot-project-${job.id}.partial`);
      job.message = job.method === 'git' ? '正在克隆 Git 仓库…' : '正在获取源码快照…';
      this.save();
      const log = line => {
        job.logs = [...job.logs, line.slice(-500)].slice(-8);
        const percent = line.match(/(?:Receiving objects|接收对象):\s+(\d+)%/);
        if (percent) job.progress = Number(percent[1]);
      };
      const detail = await (job.method === 'git' ? this.runGit : this.downloadZip)(job.repo, staging, { shallow: job.shallow, signal: controller.signal, log });
      controller.signal.throwIfAborted();
      // Resolve again before publication; never move into an owner directory redirected during download.
      if (await realpath(ownerPath) !== owner || await realpath(job.directory) !== root) throw new Error('下载期间目录发生变化，已停止。');
      if (await exists(destination)) { job.status = 'skipped'; job.message = '目标目录已出现，已跳过'; return; }
      await rename(staging, destination);
      staging = null;
      job.path = destination;
      job.status = 'completed';
      job.progress = 100;
      job.message = job.method === 'git' ? 'Git 克隆完成' : '源码快照完成（不含 Git 历史）';
      if (detail?.sha) job.commit = detail.sha;
    } catch (error) {
      job.status = controller.signal.aborted ? 'cancelled' : 'failed';
      job.message = controller.signal.aborted ? '已取消' : error.message;
    } finally {
      // Only remove the unique staging folder created for this task, inside its verified owner directory.
      if (staging && path.basename(staging) === `.hot-project-${job.id}.partial` && contained(job.directory, staging)) {
        try { await rm(staging, { recursive: true, force: true }); } catch { job.logs.push('临时目录未能清理，请关闭占用该目录的程序。'); }
      }
      job.finishedAt = new Date().toISOString();
      this.controllers.delete(job.id);
      this.save();
    }
  }
}

export async function gitClone(repo, target, { shallow, signal, log }) {
  const proxy = await gitProxy();
  signal.throwIfAborted();
  const attempt = () => new Promise((resolve, reject) => {
    // Longest matching prefix overrides this machine's broad https→http rewrite for this command only.
    const args = ['-c', 'url.https://github.com/.insteadOf=https://github.com/', '-c', 'core.hooksPath='];
    if (proxy) args.push('-c', `http.proxy=${proxy}`);
    args.push('clone', '--progress');
    if (shallow) args.push('--depth', '1');
    args.push('--', `https://github.com/${repo}.git`, target);
    const child = spawn('git', args, { shell: false, windowsHide: true, signal, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' } });
    let stderr = '';
    const timeout = setTimeout(() => { child.kill(); reject(new Error('克隆超过 10 分钟，已停止。请重试或改用源码 ZIP。')); }, 600000);
    child.stderr?.on('data', chunk => {
      const value = chunk.toString(); stderr = (stderr + value).slice(-3000);
      value.split(/[\r\n]/).filter(Boolean).forEach(log);
    });
    child.on('error', error => { clearTimeout(timeout); reject(new Error(error.code === 'ENOENT' ? '未找到 Git，请安装 Git 或改用源码 ZIP。' : error.message)); });
    child.on('close', code => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`Git 克隆失败（${code}）：${stderr.slice(-800).replaceAll(target, '[临时目录]')} 可改用源码 ZIP。`));
    });
  });
  try { return await attempt(); }
  catch (error) {
    if (signal.aborted || !/handshake|TLS|SSL|connect|Connection|timed? ?out|reset|resolve host|unexpected disconnect|early EOF|HTTP [45]\d\d/i.test(error.message) || await exists(target)) throw error;
    log('网络连接中断，自动重试一次…');
    signal.throwIfAborted();
    return attempt();
  }
}

export function archiveEntries(zip, target) {
  const entries = zip.getEntries();
  if (entries.length > 50000) throw new Error('源码包文件过多（上限 50,000）。');
  let total = 0;
  const roots = new Set(entries.map(e => e.entryName.split('/')[0]));
  if (roots.size !== 1) throw new Error('源码包根目录格式异常。');
  return entries.map(entry => {
    const name = entry.entryName;
    if (name.includes('\\') || name.split('/').includes('..') || name.startsWith('/')) throw new Error('源码包含不安全路径。');
    const relative = name.split('/').slice(1).join('/');
    if (relative.split('/').some(p => /[\x00-\x1f:]/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p))) throw new Error('源码包包含本机不支持的文件名。');
    const dest = path.resolve(target, relative);
    if (!contained(target, dest)) throw new Error('源码文件超出目标目录。');
    const mode = (entry.header.attr >>> 16) & 0xf000;
    if (mode === 0xa000) throw new Error('源码包包含符号链接，请改用 Git 克隆。');
    total += entry.header.size;
    if (total > 600 * 1024 * 1024) throw new Error('源码包解压后超过 600 MB，请使用 Git 克隆。');
    return { entry, dest, relative };
  });
}

export async function sourceSnapshot(repo, target, { signal, log }) {
  const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(180000)]);
  // HEAD follows the default branch. GitHub's ZIP comment records the exact archived commit.
  // No REST API calls are needed, so downloading source does not consume the user's API quota.
  const response = await fetch(`https://codeload.github.com/${repo}/zip/HEAD`, { signal: combinedSignal });
  if (!response.ok) throw new Error(`源码 ZIP 下载失败：HTTP ${response.status}`);
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 120 * 1024 * 1024) { await response.body.cancel().catch(() => {}); throw new Error('源码包超过 120 MB，请使用 Git 克隆。'); }
    chunks.push(chunk);
  }
  const zip = new AdmZip(Buffer.concat(chunks));
  const sha = zip.getZipComment().trim();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('源码包缺少可验证的 Git 提交标识。');
  log(`已接收 ${(size / 1024 / 1024).toFixed(1)} MB，提交 ${sha.slice(0, 7)}`);
  const entries = archiveEntries(zip, target);
  await mkdir(target, { recursive: true });
  for (const { entry, dest, relative } of entries) {
    signal.throwIfAborted();
    if (!relative) continue;
    if (entry.isDirectory) await mkdir(dest, { recursive: true });
    else { await mkdir(path.dirname(dest), { recursive: true }); await writeFile(dest, entry.getData()); }
  }
  return { sha };
}
