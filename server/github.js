// Trending HTML parser adapted from huchenme/github-trending-api (MIT).
// Copyright (c) 2019 Hu Chen. See THIRD_PARTY_NOTICES.md and upstream/.
import { load } from 'cheerio';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

export const periods = ['daily', 'weekly', 'monthly', 'all'];
export const repoPattern = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})\/[a-zA-Z0-9_.-]{1,100}$/;
export function validRepo(name) {
  return typeof name === 'string' && repoPattern.test(name) && !name.split('/').some(p => p === '.' || p === '..' || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p));
}
export function number(value) {
  const text = String(value ?? '').trim().replaceAll(',', '');
  const match = text.match(/^(\d+(?:\.\d+)?)\s*([km])?/i);
  return match ? Math.round(Number(match[1]) * ({ k: 1000, m: 1000000 }[match[2]?.toLowerCase()] || 1)) : 0;
}
export function parseTrending(html) {
  const $ = load(html);
  return $('article.Box-row').get().map(node => {
    const row = $(node);
    const href = row.find('h2 a, .h3 a, h3 a').first().attr('href');
    const fullName = href?.replace(/^\//, '');
    if (!validRepo(fullName)) return null;
    const starLink = row.find(`a[href="/${fullName}/stargazers"]`);
    const forkLink = row.find(`a[href="/${fullName}/forks"]`);
    return {
      fullName, url: `https://github.com/${fullName}`,
      description: row.find('p').first().text().trim().replace(/\s+/g, ' '),
      language: row.find('[itemprop="programmingLanguage"]').text().trim() || null,
      stars: number(starLink.length ? starLink.text() : row.find('svg.octicon-star').first().parent().text()),
      forks: number(forkLink.length ? forkLink.text() : row.find('svg.octicon-repo-forked').first().parent().text()),
      periodStars: number(row.find('.float-sm-right, .float-right').last().text())
    };
  }).filter(Boolean);
}

// 上游可达性自检：用来区分「GitHub 限流」「某个域名不可达」与「本机网络问题」。
// 只读、无副作用，返回每个域名的状态码、耗时与失败原因。
export const upstreamTargets = [
  { name: 'github.com', url: 'https://github.com/trending?since=daily' },
  { name: 'api.github.com', url: 'https://api.github.com/rate_limit' },
  { name: 'codeload.github.com', url: 'https://codeload.github.com/octocat/Spoon-Knife/zip/HEAD' },
  { name: 'raw.githubusercontent.com', url: 'https://raw.githubusercontent.com/octocat/Spoon-Knife/master/index.html' }
];
export async function probeUpstream({ name, url }, timeout = 8000) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'GitHub-Hot-Projects/1.0' }, signal: AbortSignal.timeout(timeout) });
    const bytes = (await response.arrayBuffer()).byteLength;
    return { name, ok: response.ok, status: response.status, ms: Date.now() - startedAt, bytes };
  } catch (error) {
    return { name, ok: false, status: null, ms: Date.now() - startedAt, error: error.name === 'TimeoutError' ? `超时（${timeout} ms 未完成）` : error.cause?.code || error.message };
  }
}
export async function githubFetch(url, { json = true, timeout = 16000, ...options } = {}) {  const headers = { 'User-Agent': 'GitHub-Hot-Projects/1.0', Accept: 'application/vnd.github+json', ...options.headers };
  if (new URL(url).hostname === 'api.github.com' && process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  let response;
  try {
    response = await fetch(url, { ...options, headers, signal: options.signal || AbortSignal.timeout(timeout) });
  } catch (error) {
    throw new Error(`无法连接 ${new URL(url).hostname}：${error.cause?.code || error.message}。请检查网络或代理。`);
  }
  if (!response.ok) {
    const reset = Number(response.headers.get('x-ratelimit-reset'));
    const retry = reset ? `，重置时间 ${new Date(reset * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}` : '';
    throw new Error(response.status === 403 || response.status === 429
      ? `GitHub 请求受限${retry}；可配置 GITHUB_TOKEN 后重试。`
      : `GitHub 返回 HTTP ${response.status}。`);
  }
  return json ? response.json() : response.text();
}

export class Rankings {
  constructor(dataDir, request = githubFetch) {
    this.dataDir = dataDir;
    this.request = request;
    this.pending = new Map();
  }
  async get({ period = 'daily', language = '', page = 1, refresh = false } = {}) {
    if (!periods.includes(period)) throw new Error('无效的榜单周期。');
    if (!/^[a-zA-Z0-9+# .-]{0,40}$/.test(language)) throw new Error('无效的编程语言。');
    if (!Number.isInteger(page) || page < 1 || page > 10) throw new Error('页码必须为 1 到 10。');
    if (period !== 'all') page = 1;
    const key = `${period}-${Buffer.from(language.toLowerCase()).toString('hex')}-${page}`;
    if (this.pending.has(key)) return this.pending.get(key);
    const promise = this.load(key, { period, language, page, refresh }).finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }
  async load(key, options) {
    const file = path.join(this.dataDir, `ranking-${key}.json`);
    let cached;
    try { cached = JSON.parse(await readFile(file, 'utf8')); } catch { /* first fetch */ }
    if (!options.refresh && cached && Date.now() - Date.parse(cached.fetchedAt) < 600000) return this.withFreshness(cached, true);
    try {
      const result = options.period === 'all' ? await this.total(options) : await this.trending(options);
      if (cached && Date.parse(result.dataAt) < Date.parse(cached.dataAt)) {
        return { ...this.withFreshness(cached, true), stale: true, warning: 'GitHub 直连不可用，备用快照早于本地数据；继续显示本地较新的榜单，请以数据时间为准。' };
      }
      const data = { ...result, period: options.period, language: options.language, page: options.page, fetchedAt: new Date().toISOString() };
      await mkdir(this.dataDir, { recursive: true });
      await writeFile(`${file}.tmp`, JSON.stringify(data));
      await rename(`${file}.tmp`, file);
      return this.withFreshness(data, false);
    } catch (error) {
      if (cached) return { ...this.withFreshness(cached, true), stale: true, warning: `刷新失败，显示上次数据。${error.message}` };
      throw error;
    }
  }
  withFreshness(data, cached) {
    const stale = Date.now() - Date.parse(data.dataAt) > 36 * 3600000;
    return { ...data, cached, stale, warning: stale ? '当前为历史快照，不能代表今天的榜单；请以数据时间为准。' : data.warning };
  }
  async trending({ period, language }) {
    const url = `https://github.com/trending/${encodeURIComponent(language.toLowerCase())}?since=${period}`;
    let directError;
    try {
      const html = await this.request(url, { json: false, timeout: 10000, headers: { Accept: 'text/html' } });
      const repositories = parseTrending(html);
      if (!repositories.length) throw new Error('Trending 页面为空或结构已变化。');
      repositories.sort((a, b) => b.periodStars - a.periodStars || b.stars - a.stars);
      return { repositories, source: 'GitHub Trending', sourceUrl: url, dataAt: new Date().toISOString(), total: repositories.length, scope: 'Trending 候选项目按周期新增 Star 排序，非全站完整增量榜。' };
    } catch (error) { directError = error; }
    // Public, timestamped dataset. GitHub Contents API avoids a dependency on raw.githubusercontent.com.
    try {
      const lang = language ? language.toLowerCase().replaceAll(' ', '-') : 'all';
      const fileUrl = `https://api.github.com/repos/isboyjc/github-trending-api/contents/data/${period}/${encodeURIComponent(lang)}.json`;
      const content = await this.request(fileUrl);
      if (!content.content) throw new Error('备用数据未返回内容。');
      const feed = JSON.parse(Buffer.from(content.content, 'base64').toString('utf8'));
      if (!Number.isFinite(Date.parse(feed.pubDate))) throw new Error('备用数据缺少可靠的数据时间。');
      const repositories = (feed.items || []).filter(item => validRepo(item.title)).map(item => ({
        fullName: item.title, url: `https://github.com/${item.title}`, description: String(item.description || ''),
        language: item.language || null, stars: number(item.stars), forks: number(item.forks), periodStars: number(item.addStars)
      })).sort((a, b) => b.periodStars - a.periodStars || b.stars - a.stars);
      if (!repositories.length) throw new Error('备用数据为空。');
      return { repositories, source: 'isboyjc · Trending 快照', sourceUrl: `https://github.com/isboyjc/github-trending-api/blob/main/data/${period}/${encodeURIComponent(lang)}.json`, dataAt: new Date(feed.pubDate).toISOString(), total: repositories.length, warning: `Trending 直连不可用，已切换公开快照。${directError.message}`, scope: '备用 Trending 候选集按周期新增 Star 排序，非全站完整增量榜。' };
    } catch (error) { throw new Error(`${directError.message} 备用数据也不可用：${error.message}`); }
  }
  async total({ language, page }) {
    const query = `stars:>0 fork:false${language ? ` language:"${language}"` : ''}`;
    const url = `https://api.github.com/search/repositories?${new URLSearchParams({ q: query, sort: 'stars', order: 'desc', per_page: '100', page: String(page) })}`;
    const data = await this.request(url);
    const repositories = (data.items || []).filter(r => validRepo(r.full_name)).map(r => ({
      fullName: r.full_name, url: `https://github.com/${r.full_name}`, description: r.description || '', language: r.language,
      stars: r.stargazers_count, forks: r.forks_count, periodStars: null
    }));
    return { repositories, total: Math.min(1000, data.total_count || 0), source: 'GitHub Search API', sourceUrl: 'https://github.com/search?q=stars%3A%3E0+fork%3Afalse&type=repositories&s=stars&o=desc', dataAt: new Date().toISOString(), warning: data.incomplete_results ? 'GitHub 返回了不完整结果，请稍后刷新。' : null, scope: '公开非 Fork 仓库按累计 Star 排名；受 GitHub Search 限制，最多浏览前 1,000 个。' };
  }
}
