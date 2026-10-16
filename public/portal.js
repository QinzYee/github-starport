export function datasetKey(period, language = '', page = 1) {
  return `${period}|${language.toLowerCase()}|${period === 'all' ? page : 1}`;
}
export function availableLanguages(manifest, period) {
  const prefix = `${period}|`;
  return new Set(Object.keys(manifest.datasets || {}).filter(key => key.startsWith(prefix) && key.endsWith('|1')).map(key => key.slice(prefix.length, -2)));
}
export async function getStaticRanking(params, request = fetch) {
  const manifestResponse = await request('./data/manifest.json', { cache: params.get('refresh') === '1' ? 'reload' : 'no-cache' });
  if (!manifestResponse.ok) throw new Error('榜单索引暂时不可用，请稍后刷新。');
  const manifest = await manifestResponse.json();
  const key = datasetKey(params.get('period') || 'daily', params.get('language') || '', Number(params.get('page') || 1));
  const entry = manifest.datasets?.[key];
  if (!entry || !/^data\/[a-z0-9-]+\.json$/.test(entry.file)) throw new Error('这个语言或页码的榜单尚未更新完成，请切换其他榜单后稍后重试。');
  const response = await request(`./${entry.file}`, { cache: 'no-cache' });
  if (!response.ok) throw new Error('榜单文件暂时不可用，请刷新重试。');
  const data = await response.json();
  if (!Array.isArray(data.repositories) || !Number.isFinite(Date.parse(data.dataAt))) throw new Error('榜单文件格式异常。');
  const stale = data.stale || Date.now() - Date.parse(data.dataAt) > 36 * 3600000;
  const warnings = [data.warning, stale ? '这是历史快照，请以数据时间为准。' : null];
  return { ...data, stale, snapshot: true, cached: false, publishedAt: manifest.generatedAt,
    warning: warnings.filter(Boolean).join(' ') || null,
    scope: `${data.scope || ''} 公网榜单定时更新；“刷新”读取最近已发布数据，不触发实时抓取。` };
}
