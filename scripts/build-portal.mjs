import { mkdir, cp, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dataDirectory } from './update-data.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function buildPortal({ output = path.join(root, 'dist'), snapshots = dataDirectory, helper = path.join(root, '.data', 'release', 'starport-helper-windows.zip') } = {}) {
  const manifest = JSON.parse(await readFile(path.join(snapshots, 'data', 'manifest.json'), 'utf8'));
  for (const key of ['daily||1', 'weekly||1', 'monthly||1', 'all||1']) if (!manifest.datasets[key]) throw new Error('基础榜单缺失，请先运行 npm run data:update。');
  const helperBytes = await readFile(helper); // The promised optional download must exist.
  if (helperBytes.length > 25 * 1024 * 1024) throw new Error('助手包超过静态托管的单文件上限；请使用不含运行时的标准助手包。');
  await mkdir(path.join(output, 'data'), { recursive: true });
  await mkdir(path.join(output, 'downloads'), { recursive: true });
  for (const name of await readdir(path.join(root, 'public'))) await cp(path.join(root, 'public', name), path.join(output, name), { recursive: true });
  await cp(path.join(snapshots, 'data'), path.join(output, 'data'), { recursive: true });
  let publishedPages = 0; while (manifest.datasets[`all||${publishedPages + 1}`]) publishedPages++;
  const publishedCount = Math.max(0, (publishedPages - 1) * 100 + (manifest.datasets[`all||${publishedPages}`]?.count || 0));
  for (let page = 1; page <= publishedPages; page++) {
    const file = path.join(output, manifest.datasets[`all||${page}`].file);
    const data = JSON.parse(await readFile(file, 'utf8'));
    data.total = Math.min(data.total, publishedCount);
    data.scope = `公开非 Fork 仓库按累计 Star 排序，当前发布前 ${data.total} 个，目标上限 1,000 个。`;
    await writeFile(file, JSON.stringify(data));
  }
  await cp(helper, path.join(output, 'downloads', 'starport-helper-windows.zip'));
  await cp(`${helper}.sha256`, path.join(output, 'downloads', 'starport-helper-windows.zip.sha256'));
  await writeFile(path.join(output, 'app-config.json'), JSON.stringify({ mode: 'static-portal', applicationId: 'starport', publicMode: true, maxRepos: 100, tokenConfigured: false }));
  await writeFile(path.join(output, '404.html'), '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>页面不存在</title><p>页面不存在。<a href="/">返回 Starport 榜单</a></p></html>');
  await writeFile(path.join(output, '_headers'), '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Content-Security-Policy: default-src \'self\'; script-src \'self\'; style-src \'self\'; img-src \'self\' data:; connect-src \'self\'; frame-ancestors \'none\'; base-uri \'none\'\n/app-config.json\n  Cache-Control: no-cache\n/data/*\n  Cache-Control: no-cache\n');
  console.log(`Static publication built: ${output}`);
  return output;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) buildPortal().catch(error => { console.error(error.message); process.exitCode = 1; });
