import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { Rankings, validRepo, upstreamTargets, probeUpstream } from './github.js';
import { Downloads, validateDirectory } from './downloads.js';
import { archiveLimits, createBundle } from './archive.js';
import { abortWhenClientGone } from './request.js';
import { windowsProxy } from './network.js';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(root, '.env')); } catch (error) { if (error.code !== 'ENOENT') console.warn('.env 读取失败：', error.message); }
const systemProxy = await windowsProxy();
if (systemProxy || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy) {
  setGlobalDispatcher(new EnvHttpProxyAgent({
    ...(systemProxy ? { httpProxy: process.env.HTTP_PROXY || process.env.http_proxy || systemProxy, httpsProxy: process.env.HTTPS_PROXY || process.env.https_proxy || systemProxy } : {}),
    noProxy: process.env.NO_PROXY || process.env.no_proxy || 'localhost,127.0.0.1,::1'
  }));
}
// 两种运行方式共用这一份代码：
//   本机模式（默认，npm start）：只监听回环地址，只有本机可以访问，提供目录选择与克隆到本机磁盘。
//   云端模式（server/cloud.js 或 PUBLIC_MODE=1）：监听 0.0.0.0，供反向代理的域名访问，
//   关闭一切本机能力，只保留榜单浏览与「打包下载 ZIP 到浏览器」。
// 云端容器由平台注入 PORT，因此 Linux 下检测到 PORT 即视为云端，避免平台忽略启动命令时监听错地址。
const publicMode = process.env.PUBLIC_MODE === '1'
  || (process.env.PUBLIC_MODE !== '0' && process.platform !== 'win32' && Boolean(process.env.PORT));
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, '.data');
const port = Number(process.env.PORT || 4317);
const host = publicMode ? '0.0.0.0' : '127.0.0.1';
const csrfToken = randomBytes(32).toString('hex');
const app = express();
const rankings = new Rankings(dataDir);
const downloads = new Downloads(dataDir);
await downloads.init();
let settings = { directory: path.join(root, 'downloads'), shallow: true, method: 'git' };
try { const saved = JSON.parse(await readFile(path.join(dataDir, 'settings.json'), 'utf8')); settings = { ...settings, ...saved }; } catch { /* defaults */ }
let gitAvailable = true;
try { await exec('git', ['--version'], { windowsHide: true }); } catch { gitAvailable = false; }
app.disable('x-powered-by');
app.use((req, res, next) => {
  let hostname;
  try { hostname = new URL(`http://${req.headers.host}`).hostname; } catch { return res.sendStatus(403); }
  const isLocalHost = ['127.0.0.1', 'localhost', '[::1]'].includes(hostname);
  if (!publicMode && !isLocalHost) return res.status(403).json({ error: '仅允许本机访问。' });
  const origin = req.headers.origin;
  if (origin) {
    // 本机模式要求来源与本机地址完全一致；云端域名的协议由平台代理决定，因此只比较主机名。
    let crossSite = true;
    try { crossSite = publicMode ? new URL(origin).host !== req.headers.host : origin !== `http://${req.headers.host}`; } catch { crossSite = true; }
    if (crossSite) return res.status(403).json({ error: '不允许跨站请求。' });
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-local-token'] !== csrfToken) return res.status(403).json({ error: '会话已失效，请刷新页面重试。' });
  next();
});
app.use(express.json({ limit: '64kb' }));
app.get('/app-config.json', (req, res) => res.json({ mode: publicMode ? 'legacy-cloud' : 'local' }));
// 云端模式下这些接口只对本机有意义，直接拒绝，不用模拟出来的假能力顶替。
const localOnly = handler => publicMode
  ? (req, res) => res.status(403).json({ error: '云端演示版不提供本机目录与克隆能力，请使用「打包下载 ZIP」。' })
  : handler;
app.get('/api/config', (req, res) => res.json({
  applicationId: 'starport',
  ...(publicMode ? {} : settings),
  publicMode,
  maxRepos: archiveLimits.repositories,
  csrfToken,
  gitAvailable,
  platform: process.platform,
  tokenConfigured: Boolean(process.env.GITHUB_TOKEN)
}));
app.get('/api/rankings', async (req, res) => {
  const data = await rankings.get({ period: req.query.period || 'daily', language: req.query.language || '', page: Number(req.query.page || 1), refresh: req.query.refresh === '1' });
  res.json(data);
});
// 上游自检：一键区分限流、域名不可达与本机网络问题。
app.get('/api/upstreams', async (req, res) => res.json({
  checkedAt: new Date().toISOString(),
  results: await Promise.all(upstreamTargets.map(target => probeUpstream(target)))
}));
app.get('/api/downloads', (req, res) => res.json({ jobs: downloads.jobs.slice(-500).toReversed() }));
app.post('/api/downloads', localOnly(async (req, res) => {
  const added = await downloads.add(req.body);
  settings = { directory: validateDirectory(req.body.directory), shallow: req.body.shallow !== false, method: req.body.method || 'git' };
  await mkdir(dataDir, { recursive: true });
  try { await writeFile(path.join(dataDir, 'settings.json'), JSON.stringify(settings)); } catch (error) { console.warn('默认下载设置保存失败：', error.message); }
  res.status(202).json({ jobs: added });
}));
app.post('/api/downloads/:id/cancel', localOnly((req, res) => res.json(downloads.cancel(req.params.id))));
app.post('/api/downloads/:id/retry', localOnly(async (req, res) => res.status(202).json({ jobs: await downloads.retry(req.params.id) })));
let choosing = false;
app.post('/api/directory/pick', localOnly(async (req, res) => {
  if (process.platform !== 'win32') throw new Error('此平台请直接填写目标目录的绝对路径。');
  if (choosing) throw new Error('目录选择窗口已打开，请在任务栏中查看。');
  choosing = true;
  try {
    const script = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::EnableVisualStyles(); $picker = New-Object System.Windows.Forms.FolderBrowserDialog; $picker.Description = '选择 GitHub 项目保存目录'; $picker.ShowNewFolderButton = $true; $owner = New-Object System.Windows.Forms.Form; $owner.TopMost = $true; if ($picker.ShowDialog($owner) -eq 'OK') { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [Console]::Write($picker.SelectedPath) }; $owner.Dispose(); $picker.Dispose()`;
    const { stdout } = await exec('powershell.exe', ['-NoProfile', '-STA', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 180000 });
    res.json({ directory: stdout.trim() || null });
  } finally { choosing = false; }
}));
app.post('/api/downloads/:id/open', localOnly(async (req, res) => {
  const job = downloads.jobs.find(j => j.id === req.params.id && j.status === 'completed');
  if (!job) throw new Error('只能打开已完成的项目。');
  const target = await realpath(job.path);
  const command = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const child = spawn(command, [target], { windowsHide: true, stdio: 'ignore', detached: true });
  child.on('error', error => console.warn('打开目录失败：', error.message));
  child.unref();
  res.json({ ok: true });
}));
// 云端打包下载：抓源码 → 合并成一个 ZIP → 直接回传浏览器。不写服务器磁盘，不执行 Git。
let archiving = false;
const archiveHits = new Map();
app.post('/api/archive', async (req, res) => {
  if (!publicMode) return res.status(403).json({ error: '打包下载只在云端模式可用，本机请直接使用下载功能。' });
  const repositories = [...new Set(Array.isArray(req.body?.repositories) ? req.body.repositories : [])];
  if (!repositories.length || repositories.length > archiveLimits.repositories || !repositories.every(validRepo)) {
    return res.status(400).json({ error: `请选择 1–${archiveLimits.repositories} 个有效的 GitHub 仓库。` });
  }
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const hits = (archiveHits.get(ip) || []).filter(at => now - at < 3600000);
  if (hits.length >= 30) return res.status(429).json({ error: '打包请求过于频繁，请稍后再试。' });
  if (archiving) return res.status(429).json({ error: '已有打包任务在进行，请稍后重试。' });
  hits.push(now);
  if (archiveHits.size > 5000) archiveHits.clear();
  archiveHits.set(ip, hits);
  archiving = true;
  const controller = new AbortController();
  abortWhenClientGone(res, controller);
  try {
    const { buffer, report, filename } = await createBundle(repositories, {
      signal: controller.signal,
      log: line => console.log(`[archive] ${line}`)
    });
    if (controller.signal.aborted || res.headersSent) return;
    res.setHeader('X-Archive-Report', Buffer.from(JSON.stringify(report)).toString('base64'));
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (error) {
    console.warn('[archive] 打包失败：', error.message);
    if (controller.signal.aborted || res.headersSent) return;
    res.status(400).json({ error: error.message || '打包失败，请稍后重试。' });
  } finally {
    archiving = false;
  }
});
app.use(express.static(path.join(root, 'public')));
app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在。' }));
app.use((error, req, res, next) => {
  res.status(error.status || 400).json({ error: error.type === 'entity.parse.failed' ? '请求内容不是有效 JSON。' : error.message || '请求失败，请稍后重试。' });
});
const server = app.listen(port, host, () => {
  const url = `http://${publicMode ? '127.0.0.1' : host}:${port}`;
  console.log(`GitHub Hot Projects 已启动（${publicMode ? '云端模式' : '本机模式'}）：${url}`);
  if (process.env.STARPORT_OPEN === '1' && process.platform === 'win32') {
    exec('cmd.exe', ['/c', 'start', '', url], { windowsHide: true }).catch(() => console.warn(`请在浏览器打开 ${url}`));
  }
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用。请访问现有服务，或设置 PORT 后重启。` : error.message); process.exitCode = 1; });
