import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { number, validRepo, parseTrending, Rankings } from '../server/github.js';
import { parseWindowsProxy } from '../server/network.js';

test('Windows 系统代理解析支持统一地址或按协议指定，拒绝不支持的协议', () => {
  assert.equal(parseWindowsProxy('127.0.0.1:7897'), 'http://127.0.0.1:7897/');
  assert.equal(parseWindowsProxy('http=localhost:8080;https=localhost:8081'), 'http://localhost:8081/');
  assert.equal(parseWindowsProxy('socks=localhost:1080'), null);
  assert.equal(parseWindowsProxy('socks5://localhost:1080'), null);
  assert.equal(parseWindowsProxy(null), null);
});

test('数字支持千位分隔、小数缩写和缺省值', () => {
  assert.equal(number('1,234,567'), 1234567);
  assert.equal(number('3,421 stars this week'), 3421);
  assert.equal(number('2.3k'), 2300);
  assert.equal(number('1.2M'), 1200000);
  assert.equal(number(null), 0);
});
test('仓库校验阻止遍历、命令注入与 Windows 设备名', () => {
  for (const name of ['octocat/Hello-World', 'org/.github', 'abc-123/repo_name']) assert.ok(validRepo(name), name);
  for (const name of ['../test', 'a/..', 'a/.', 'a/b;calc', '-x/repo', 'a/repo.git/', 'a/CON', 'a/NUL.txt', 'a/repo.', 'https://github.com/a/b', 'a/b/c']) assert.equal(validRepo(name), false, name);
});
const html = `<!doctype html><div class="Box"><article class="Box-row"><h2 class="h3"><a href="/org/project">org / project</a></h2><p class="my-1">A real\n project description</p><span itemprop="programmingLanguage">TypeScript</span><a href="/org/project/stargazers">1,234,567</a><a href="/org/project/forks">2,345</a><span class="float-sm-right">5,678 stars today</span></article><article class="Box-row"><h2><a href="/sponsors/example">Sponsor</a></h2></article></div>`;
test('改编的抓取器读取 h2 链接与多逗号 Star 数，不混淆周期增长和累计值', () => {
  const repos = parseTrending(html);
  assert.deepEqual(repos[0], { fullName: 'org/project', url: 'https://github.com/org/project', description: 'A real project description', language: 'TypeScript', stars: 1234567, forks: 2345, periodStars: 5678 });
});
async function temp(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'starport-rank-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
test('抓取缓存合并并发请求，刷新失败时返回标记过期的旧数据', async t => {
  const dir = await temp(t);
  let count = 0;
  let offline = false;
  const rankings = new Rankings(dir, async () => {
    count++;
    if (offline) throw new Error('offline');
    await new Promise(resolve => setTimeout(resolve, 5));
    return html;
  });
  const [a, b] = await Promise.all([rankings.get(), rankings.get()]);
  assert.equal(count, 1);
  assert.equal(a.dataAt, b.dataAt);
  assert.equal((await rankings.get()).cached, true);
  offline = true;
  const fallback = await rankings.get({ refresh: true });
  assert.equal(fallback.stale, true);
  assert.match(fallback.warning, /刷新失败/);
  assert.equal(fallback.repositories[0].fullName, 'org/project');
});
test('公开快照使用上游 pubDate，绝不把陈旧快照标为今日数据', async t => {
  const feed = { pubDate: 'Mon, 01 Jan 2024 00:00:00 GMT', items: [{ title: 'org/project', stars: '2,000', forks: '10', addStars: '123' }] };
  const rankings = new Rankings(await temp(t), async url => {
    if (url.startsWith('https://github.com/')) throw new Error('direct blocked');
    return { content: Buffer.from(JSON.stringify(feed)).toString('base64') };
  });
  const result = await rankings.get({ period: 'weekly' });
  assert.equal(result.dataAt, '2024-01-01T00:00:00.000Z');
  assert.equal(result.stale, true);
  assert.equal(result.repositories[0].periodStars, 123);
  assert.match(result.warning, /历史快照/);
});
test('备用快照无可信日期时明确失败', async t => {
  const rankings = new Rankings(await temp(t), async url => {
    if (url.startsWith('https://github.com/')) throw new Error('direct blocked');
    return { content: Buffer.from(JSON.stringify({ items: [] })).toString('base64') };
  });
  await assert.rejects(rankings.get(), /可靠的数据时间/);
});
test('较旧的备用快照不能覆盖较新的本地实时缓存', async t => {
  let offline = false;
  const feed = { pubDate: 'Mon, 01 Jan 2024 00:00:00 GMT', items: [{ title: 'org/older', stars: '100', addStars: '10' }] };
  const rankings = new Rankings(await temp(t), async url => {
    if (!offline) return html;
    if (url.startsWith('https://github.com/')) throw new Error('offline');
    return { content: Buffer.from(JSON.stringify(feed)).toString('base64') };
  });
  const initial = await rankings.get();
  offline = true;
  const fallback = await rankings.get({ refresh: true });
  assert.equal(fallback.dataAt, initial.dataAt);
  assert.equal(fallback.repositories[0].fullName, 'org/project');
  assert.equal(fallback.cached, true);
  assert.equal(fallback.stale, true);
  assert.match(fallback.warning, /本地较新/);
});
test('累计榜按官方 stars 排序查询，限制1000结果且提示不完整数据', async t => {
  let requested;
  const rankings = new Rankings(await temp(t), async url => {
    requested = new URL(url);
    return { total_count: 300000, incomplete_results: true, items: [{ full_name: 'org/project', description: 'test', language: 'C++', stargazers_count: 123, forks_count: 9 }] };
  });
  const data = await rankings.get({ period: 'all', language: 'C++', page: 2 });
  assert.equal(requested.searchParams.get('q'), 'stars:>0 fork:false language:"C++"');
  assert.equal(requested.searchParams.get('sort'), 'stars');
  assert.equal(requested.searchParams.get('page'), '2');
  assert.equal(data.total, 1000);
  assert.equal(data.repositories[0].periodStars, null);
  assert.match(data.warning, /不完整/);
});
