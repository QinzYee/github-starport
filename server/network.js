import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

export function parseWindowsProxy(value) {
  if (!value || typeof value !== 'string') return null;
  const pieces = value.split(';');
  const selected = pieces.find(p => /^https=/i.test(p)) || pieces.find(p => /^http=/i.test(p)) || pieces.find(p => !p.includes('='));
  if (!selected) return null;
  const raw = selected.replace(/^https?=/i, '').trim();
  try {
    const url = new URL(raw.includes('://') ? raw : `http://${raw}`);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
export async function windowsProxy() {
  if (process.platform !== 'win32') return null;
  try {
    const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
    const { stdout: enabled } = await exec('reg.exe', ['query', key, '/v', 'ProxyEnable'], { windowsHide: true });
    if (!/REG_DWORD\s+0x1\b/i.test(enabled)) return null;
    const { stdout } = await exec('reg.exe', ['query', key, '/v', 'ProxyServer'], { windowsHide: true });
    return parseWindowsProxy(stdout.match(/REG_SZ\s+(.+)/i)?.[1]);
  } catch { return null; }
}
let resolved;
export async function gitProxy() {
  if (!resolved) resolved = (async () => {
    // curl/Git already understands environment proxy variables and explicit Git config.
    if (process.env.https_proxy || process.env.HTTPS_PROXY || process.env.all_proxy || process.env.ALL_PROXY) return null;
    try {
      const { stdout } = await exec('git', ['config', '--get-urlmatch', 'http.proxy', 'https://github.com/'], { windowsHide: true });
      if (stdout.trim()) return null;
    } catch { /* no explicit Git proxy */ }
    return windowsProxy();
  })();
  return resolved;
}
