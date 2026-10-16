import { readFile, writeFile, mkdir, readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import AdmZip from 'adm-zip';
import { windowsProxy } from '../server/network.js';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodeVersion = 'v24.16.0';
async function nodeRuntime() {
  const name = `node-${nodeVersion}-win-x64.zip`;
  const directory = path.join(root, '.data', 'runtime-cache');
  await mkdir(directory, { recursive: true });
  const proxy = await windowsProxy();
  if (proxy || process.env.HTTPS_PROXY || process.env.HTTP_PROXY) setGlobalDispatcher(new EnvHttpProxyAgent({ ...(proxy ? { httpProxy: proxy, httpsProxy: proxy } : {}), noProxy: process.env.NO_PROXY || 'localhost,127.0.0.1' }));
  const checksumsResponse = await fetch(`https://nodejs.org/dist/${nodeVersion}/SHASUMS256.txt`, { signal: AbortSignal.timeout(60000) });
  if (!checksumsResponse.ok) throw new Error('无法获取 Node.js 官方校验清单。');
  const checksums = await checksumsResponse.text();
  const checksum = checksums.split('\n').find(line => line.trim().endsWith(` ${name}`))?.trim().split(/\s+/)[0];
  if (!/^[a-f0-9]{64}$/.test(checksum || '')) throw new Error('Node.js 校验清单中没有预期的 Windows 版本。');
  let bytes;
  try { bytes = await readFile(path.join(directory, name)); } catch { /* download */ }
  if (!bytes || createHash('sha256').update(bytes).digest('hex') !== checksum) {
    const response = await fetch(`https://nodejs.org/dist/${nodeVersion}/${name}`, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error(`Node.js 运行时下载失败：HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== checksum) throw new Error('Node.js 运行时校验失败。');
    await writeFile(path.join(directory, name), bytes);
  }
  const archive = new AdmZip(bytes);
  return { executable: archive.readFile(`node-${nodeVersion}-win-x64/node.exe`), license: archive.readFile(`node-${nodeVersion}-win-x64/LICENSE`) };
}
export async function buildHelper({ runtime = false, output = path.join(root, '.data', 'release', 'starport-helper-windows.zip') } = {}) {
  const zip = new AdmZip();
  const add = async (source, destination) => {
    const info = await lstat(source);
    if (info.isSymbolicLink()) return;
    if (info.isDirectory()) {
      for (const entry of await readdir(source)) if (!['.bin', '.cache', 'node_modules'].includes(entry)) await add(path.join(source, entry), `${destination}/${entry}`);
    } else zip.addFile(`starport-helper/${destination}`, await readFile(source));
  };
  for (const directory of ['public', 'server']) await add(path.join(root, directory), directory);
  const included = new Set();
  async function addDependency(name, parent) {
    const require = createRequire(path.join(parent, 'package.json'));
    let folder;
    try { folder = path.dirname(require.resolve(`${name}/package.json`)); }
    catch {
      folder = path.dirname(require.resolve(name));
      while (folder !== path.dirname(folder)) {
        try { if (JSON.parse(await readFile(path.join(folder, 'package.json'), 'utf8')).name === name) break; } catch { /* continue upward */ }
        folder = path.dirname(folder);
      }
    }
    if (included.has(folder)) return;
    const relative = path.relative(root, folder);
    if (!relative.startsWith(`node_modules${path.sep}`) || relative.includes('..')) throw new Error(`依赖目录异常：${name}`);
    included.add(folder);
    await add(folder, relative.split(path.sep).join('/'));
    const pkg = JSON.parse(await readFile(path.join(folder, 'package.json'), 'utf8'));
    for (const dependency of Object.keys(pkg.dependencies || {})) await addDependency(dependency, folder);
  }
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  for (const name of Object.keys(packageJson.dependencies || {})) await addDependency(name, root);
  for (const file of ['package.json', 'package-lock.json', 'start.cmd', 'install-helper.cmd', 'uninstall-helper.cmd', 'THIRD_PARTY_NOTICES.md']) await add(path.join(root, file), file);
  for (const file of ['open-link.mjs', 'install-helper.mjs', 'bootstrap-helper.ps1']) await add(path.join(root, 'scripts', file), `scripts/${file}`);
  await add(path.join(root, 'upstream', 'github-trending-api-master', 'LICENSE'), 'upstream/github-trending-api-master/LICENSE');
  zip.addFile('starport-helper/README.txt', Buffer.from('Starport Windows helper\r\n\r\nExtract the entire folder to a stable location. Run install-helper.cmd once.\r\nOn the public website click Open local helper, then review repositories and destination before downloading.\r\nGit clones require Git: https://git-scm.com/download/win\r\nWithout Git you can still use ZIP downloads. The installer downloads Node.js from nodejs.org and verifies SHA256; dependencies are included.\r\nRun start.cmd to use the helper directly; import *.starport.json project lists when protocol opening is unavailable.\r\nRun uninstall-helper.cmd before moving or removing the helper folder.\r\nNo downloaded repository code is executed.\r\n'));
  if (runtime) {
    const node = await nodeRuntime();
    if (!node.executable || !node.license) throw new Error('Node.js 归档缺少运行文件或许可。');
    zip.addFile('starport-helper/runtime/node.exe', node.executable);
    zip.addFile('starport-helper/runtime/LICENSE', node.license);
  }
  await mkdir(path.dirname(output), { recursive: true });
  const buffer = zip.toBuffer(); await writeFile(output, buffer);
  await writeFile(`${output}.sha256`, `${createHash('sha256').update(buffer).digest('hex')}  ${path.basename(output)}\n`);
  return output;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) buildHelper({ runtime: process.argv.includes('--include-runtime') }).then(console.log).catch(error => { console.error(error.message); process.exitCode = 1; });
