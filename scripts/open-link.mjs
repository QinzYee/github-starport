import { spawn, execFile } from 'node:child_process';
import { mkdir, open } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';
import { parseHelperLink, encodeSelection } from '../public/selection.js';
const exec = promisify(execFile);
export async function launchHelper(link) {
  const selection = parseHelperLink(link); // Validate before starting a process or making requests.
  if (process.platform !== 'win32') throw new Error('链接唤醒目前支持 Windows，其他平台可在本地网页导入清单文件。');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const base = 'http://127.0.0.1:4317';
  const ready = async () => {
    try { const response = await fetch(`${base}/api/config`, { signal: AbortSignal.timeout(1500) });
      const config = await response.json();
      if (response.ok && config.applicationId === 'starport' && !config.publicMode) return true;
      throw new Error('端口 4317 被其他服务占用，请关闭该服务后重试。');
    } catch (error) { if (/端口/.test(error.message)) throw error; return false; }
  };
  if (!await ready()) {
    await mkdir(path.join(root, '.data'), { recursive: true });
    const log = await open(path.join(root, '.data', 'helper.log'), 'a');
    try {
      const child = spawn(process.execPath, [path.join(root, 'server', 'index.js')], { cwd: root, env: { ...process.env, PUBLIC_MODE: '0', PORT: '4317', STARPORT_OPEN: '0' }, detached: true, windowsHide: true, stdio: ['ignore', log.fd, log.fd] });
      const started = new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
      await started; child.unref();
    } finally { await log.close(); }
    let connected = false;
    for (let i = 0; i < 60; i++) { if (await ready()) { connected = true; break; } await new Promise(resolve => setTimeout(resolve, 250)); }
    if (!connected) throw new Error('助手未能启动，请解压后运行 start.cmd，查看 .data/helper.log。');
  }
  // Only repository names enter a URL fragment; server and shell never receive commands or paths from the site.
  const url = `${base}/#import=${encodeSelection(selection)}`;
  const script = `Start-Process -FilePath '${url}'`;
  await exec('powershell.exe', ['-NoProfile', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true });
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  launchHelper(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
}
