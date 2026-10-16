import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Rankings } from '../server/github.js';
import { windowsProxy } from '../server/network.js';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import { datasetKey } from '../public/portal.js';
export const languages = ['', 'Python', 'TypeScript', 'JavaScript', 'Go', 'Rust', 'Java', 'C++', 'C', 'C#', 'HTML', 'Vue', 'Swift', 'Kotlin', 'PHP', 'Ruby', 'Shell'];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const dataDirectory = path.join(root, '.data', 'portal-data');
export async function refreshPortal({ directory = dataDirectory, rankings = new Rankings(path.join(root, '.data')), selectedLanguages = languages, selectedPeriods = ['daily', 'weekly', 'monthly', 'all'], totalPages = 10, pause = process.env.GITHUB_TOKEN ? 2300 : 6500, log = console.log } = {}) {
  await mkdir(path.join(directory, 'data'), { recursive: true });
  let previous = { datasets: {} };
  try { previous = JSON.parse(await readFile(path.join(directory, 'data', 'manifest.json'), 'utf8')); } catch { /* first publication */ }
  // Recover fully written dataset files if a previous first build stopped before publishing its index.
  for (const file of await readdir(path.join(directory, 'data'))) {
    if (!/^(daily|weekly|monthly|all)-[a-z0-9-]+\.json$/.test(file)) continue;
    try {
      const data = JSON.parse(await readFile(path.join(directory, 'data', file), 'utf8'));
      if (['daily', 'weekly', 'monthly', 'all'].includes(data.period) && Array.isArray(data.repositories) && data.repositories.length && Number.isFinite(Date.parse(data.dataAt))) previous.datasets[datasetKey(data.period, data.language || '', data.page || 1)] = { file: `data/${file}`, dataAt: data.dataAt, count: data.repositories.length };
    } catch { /* incomplete file */ }
  }
  const manifest = { format: 1, generatedAt: new Date().toISOString(), datasets: { ...previous.datasets }, failures: [] };
  const allResults = [];
  for (const language of selectedLanguages) {
    for (const period of selectedPeriods) {
      for (let page = 1; page <= (period === 'all' && !language ? totalPages : 1); page++) {
        const key = datasetKey(period, language, page);
        try {
          const result = await rankings.get({ period, language, page, refresh: true });
          if (!result.repositories?.length) throw new Error('未返回项目，保留已有快照。');
          if (period === 'all') {
            result.total = Math.min(result.total, language ? 100 : totalPages * 100);
            result.scope = language ? `公开非 Fork 的 ${language} 仓库按累计 Star 排序，收录前 ${result.repositories.length} 个。` : `公开非 Fork 仓库按累计 Star 排序，最多收录前 ${totalPages * 100} 个。`;
          }
          const file = `data/${period}-${Buffer.from(language.toLowerCase()).toString('hex') || 'all'}-${page}.json`;
          await writeFile(path.join(directory, file), JSON.stringify({ ...result, snapshot: true }));
          manifest.datasets[key] = { file, dataAt: result.dataAt, count: result.repositories.length };
          allResults.push({ period, language, page, file, result });
          log(`${period} / ${language || 'all'} / ${page}: ${result.repositories.length}${result.stale ? ' (historical)' : ''}`);
          if (period === 'all' && result.repositories.length < 100) break;
        } catch (error) {
          manifest.failures.push({ period, language, page, message: error.message });
          log(`${period} / ${language || 'all'} / ${page}: unavailable; existing published snapshot retained`);
          if (period === 'all') break;
        }
        if (period === 'all' && pause) await new Promise(resolve => setTimeout(resolve, pause));
      }
    }
  }
  // Do not advertise pages which do not exist on this publication.
  let pages = 0; while (manifest.datasets[datasetKey('all', '', pages + 1)]) pages++;
  for (const entry of allResults.filter(entry => entry.period === 'all' && !entry.language)) {
    entry.result.total = Math.min(entry.result.total, pages * 100);
    await writeFile(path.join(directory, entry.file), JSON.stringify({ ...entry.result, snapshot: true }));
  }
  for (const period of ['daily', 'weekly', 'monthly', 'all']) {
    if (!manifest.datasets[datasetKey(period)]) throw new Error(`${period} 基础榜单尚未获取成功，拒绝生成缺失榜单的发布包。`);
  }
  await writeFile(path.join(directory, 'data', 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.loadEnvFile(path.join(root, '.env')); } catch { /* optional */ }
  const proxy = await windowsProxy();
  if (proxy || process.env.HTTPS_PROXY || process.env.HTTP_PROXY) setGlobalDispatcher(new EnvHttpProxyAgent({ ...(proxy ? { httpProxy: proxy, httpsProxy: proxy } : {}), noProxy: process.env.NO_PROXY || 'localhost,127.0.0.1' }));
  const options = process.argv.includes('--quick') ? { selectedLanguages: [''], totalPages: 1 } : process.argv.includes('--totals-only') ? { selectedPeriods: ['all'] } : {};
  refreshPortal(options).then(manifest => console.log(`Published snapshot set ready: ${Object.keys(manifest.datasets).length} datasets, ${manifest.failures.length} upstream failures.`)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
