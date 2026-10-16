import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
if (process.platform !== 'win32') throw new Error('链接唤醒安装程序目前支持 Windows。');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const key = 'HKCU\\Software\\Classes\\starport';
if (process.argv.includes('--uninstall')) {
  try { await exec('reg.exe', ['delete', key, '/f'], { windowsHide: true }); } catch (error) { if (error.code !== 1) throw error; }
  console.log('Starport link registration removed. Downloaded projects are unchanged.');
} else {
  const command = `"${process.execPath}" "${path.join(root, 'scripts', 'open-link.mjs')}" "%1"`;
  for (const args of [
    ['add', key, '/ve', '/d', 'URL:Starport Selection', '/f'],
    ['add', key, '/v', 'URL Protocol', '/d', '', '/f'],
    ['add', `${key}\\shell\\open\\command`, '/ve', '/d', command, '/f']
  ]) await exec('reg.exe', args, { windowsHide: true });
  console.log('Starport helper registered for the current Windows user.');
  console.log('On the website choose Open local helper; review repositories and directory before downloading.');
}
