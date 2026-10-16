// 云端模式的真实网络验证：确认公网监听、本机能力关闭、以及「打包下载 ZIP」端到端可用。
// 不触碰本机的下载历史与目录。
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(path.join(os.tmpdir(), 'starport-cloud-'));
const socket = createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const child = spawn(process.execPath, ['server/cloud.js'], { cwd: root, env: { ...process.env, PORT: String(port), DATA_DIR: path.join(temp, 'data') }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
child.stdout.on('data', chunk => process.stdout.write(chunk));
const exited = new Promise(resolve => child.once('exit', resolve));
const base = `http://127.0.0.1:${port}`;
const post = (url, body, token) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Local-Token': token } : {}) }, body: JSON.stringify(body) });
let config;
try {
  for (let n = 0; n < 100; n++) {
    try {
      const response = await fetch(base + '/api/config');
      if (response.ok) { config = await response.json(); break; }
    } catch { /* still starting */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(config, 'cloud service did not start');
  assert.equal(config.publicMode, true, 'server/cloud.js must run in public mode');
  assert.equal(config.directory, undefined, 'cloud config must not expose a server-side directory');
  // 本机专属能力必须关闭
  assert.equal((await post('/api/directory/pick', {}, config.csrfToken)).status, 403, '目录选择必须关闭');
  assert.equal((await post('/api/downloads', { repositories: ['octocat/Hello-World'], directory: '/tmp/x' }, config.csrfToken)).status, 403, '本机克隆必须关闭');
  // 会话令牌与跨站请求仍然拦截
  assert.equal((await post('/api/archive', {})).status, 403, '缺少会话令牌必须拒绝');
  assert.equal((await fetch(base + '/api/config', { headers: { Origin: 'https://evil.example' } })).status, 403, '跨站来源必须拒绝');
  // 真实打包：两个小仓库合并成一个 ZIP
  const repositories = ['octocat/Hello-World', 'octocat/Spoon-Knife'];
  const started = Date.now();
  const response = await post('/api/archive', { repositories }, config.csrfToken);
  assert.ok(response.ok, `archive -> ${response.status} ${await response.text()}`);
  assert.match(response.headers.get('content-type'), /application\/zip/);
  const report = JSON.parse(Buffer.from(response.headers.get('x-archive-report'), 'base64').toString('utf8'));
  const buffer = Buffer.from(await response.arrayBuffer());
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  for (const repo of repositories) {
    assert.ok(entries.some(entry => entry.entryName.startsWith(`${repo}/`) && !entry.entryName.endsWith('/')), `${repo} 的文件缺失`);
  }
  assert.ok(entries.every(entry => !entry.entryName.includes('..') && !entry.entryName.startsWith('/')), '打包结果不允许出现逃逸路径');
  assert.ok(report.every(item => item.status === 'completed' && /^[a-f0-9]{40}$/.test(item.sha)), '每个仓库都应带提交标识');
  // 超出上限直接拒绝
  const tooMany = await post('/api/archive', { repositories: Array.from({ length: config.maxRepos + 1 }, (unused, index) => `octocat/Hello-World${index}`) }, config.csrfToken);
  assert.equal(tooMany.status, 400, '超过仓库上限必须拒绝');
  console.log('Report:', JSON.stringify(report));
  console.log(`PASS: 云端模式单一端口、本机接口已关闭、真实打包 ${entries.length} 个文件 ${(buffer.length / 1024).toFixed(0)} KB，用时 ${((Date.now() - started) / 1000).toFixed(1)} 秒。`);
} finally {
  child.kill();
  await exited;
  assert.ok(path.dirname(temp) === os.tmpdir() && path.basename(temp).startsWith('starport-cloud-'));
  await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}
