import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { selectionDocument, validateSelection, helperLink, parseHelperLink, decodeSelection } from '../public/selection.js';
import { datasetKey, getStaticRanking, availableLanguages } from '../public/portal.js';
import { refreshPortal } from '../scripts/update-data.mjs';
import { buildPortal } from '../scripts/build-portal.mjs';

test('公网清单往返助手链接，只含仓库名并去重', () => {
  const document = selectionDocument(['octocat/Hello-World', 'org/.github', 'octocat/Hello-World']);
  assert.deepEqual(parseHelperLink(helperLink(document)), { format: 'starport-selection', version: 1, repositories: ['octocat/Hello-World', 'org/.github'] });
});
test('清单拒绝命令、磁盘路径、自动下载字段和超过100项目', () => {
  for (const repo of ['a/b;calc', 'a/../b', 'F:\\repo', 'a/CON.txt', 'a/b%22']) assert.throws(() => selectionDocument([repo]));
  assert.throws(() => validateSelection({ ...selectionDocument(['a/b']), directory: 'C:\\Windows' }));
  assert.throws(() => validateSelection({ ...selectionDocument(['a/b']), autoRun: true }));
  assert.throws(() => selectionDocument(Array.from({ length: 101 }, (_, i) => `a/b${i}`)));
});
test('助手协议拒绝任意协议、外部主机、重复载荷、超长和损坏输入', () => {
  const link = helperLink(selectionDocument(['a/b']));
  for (const value of [link.replace('starport:', 'https:'), link.replace('//import', '//evil'), `${link}&command=calc`, `${link}&data=abc`, `${link}#bad`]) assert.throws(() => parseHelperLink(value));
  assert.throws(() => decodeSelection('a'.repeat(22001)));
  assert.throws(() => decodeSelection('%%%'));
});
test('静态榜单按周期、语言、页码读取，并明确标记历史数据', async () => {
  const key = datasetKey('all', 'C#', 2);
  assert.equal(key, 'all|c#|2');
  const calls = [];
  const request = async url => {
    calls.push(url);
    return { ok: true, json: async () => url.includes('manifest') ? { generatedAt: '2026-10-15T00:00:00Z', datasets: { [key]: { file: 'data/all-6323-2.json' } } } : { repositories: [], dataAt: '2024-01-01T00:00:00Z', scope: 'test' } };
  };
  const data = await getStaticRanking(new URLSearchParams({ period: 'all', language: 'C#', page: '2' }), request);
  assert.equal(data.stale, true);
  assert.equal(data.snapshot, true);
  assert.match(data.scope, /不触发实时抓取/);
  assert.deepEqual(calls, ['./data/manifest.json', './data/all-6323-2.json']);
});
test('静态索引不得跳转到其他地址或父目录', async () => {
  const request = async () => ({ ok: true, json: async () => ({ datasets: { 'daily||1': { file: '../secrets.json' } } }) });
  await assert.rejects(getStaticRanking(new URLSearchParams(), request), /尚未更新/);
});
test('每个周期只开放已发布的语言，不能把其他周期或第二页误作可用', () => {
  const manifest = { datasets: { 'all||1': {}, 'all|python|1': {}, 'daily|go|1': {}, 'all|go|2': {} } };
  assert.deepEqual([...availableLanguages(manifest, 'all')].sort(), ['', 'python']);
  assert.deepEqual([...availableLanguages(manifest, 'daily')], ['go']);
});
test('发布生成器保留失败项旧快照，基础数据缺失时阻止首次发布', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'starport-publish-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let broken = false;
  const rankings = { get: async ({ period, language, page }) => {
    if (broken) throw new Error('offline');
    return { repositories: [{ fullName: 'a/b', stars: 1 }], period, language, page, total: 1, dataAt: '2026-10-15T00:00:00Z', scope: 'fixture' };
  } };
  const first = await refreshPortal({ directory, rankings, selectedLanguages: [''], totalPages: 1, pause: 0, log: () => {} });
  assert.equal(Object.keys(first.datasets).length, 4);
  const before = await readFile(path.join(directory, first.datasets['daily||1'].file), 'utf8');
  broken = true;
  const second = await refreshPortal({ directory, rankings, selectedLanguages: [''], totalPages: 1, pause: 0, log: () => {} });
  assert.equal(second.failures.length, 4);
  assert.equal(await readFile(path.join(directory, first.datasets['daily||1'].file), 'utf8'), before);
  await assert.rejects(refreshPortal({ directory: path.join(directory, 'empty'), rankings, selectedLanguages: [''], pause: 0, log: () => {} }), /基础榜单/);
});
test('静态发布仅复制网页和榜单，不需要助手包或包含本地设置', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'starport-static-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const snapshots = path.join(directory, 'snapshots');
  const rankings = { get: async ({ period, language, page }) => ({ repositories: [{ fullName: 'a/b' }], period, language, page, dataAt: '2026-10-15T00:00:00Z', total: 1 }) };
  await refreshPortal({ directory: snapshots, rankings, selectedLanguages: [''], totalPages: 1, pause: 0, log: () => {} });
  const output = path.join(directory, 'dist');
  await buildPortal({ output, snapshots });
  assert.equal(JSON.parse(await readFile(path.join(output, 'app-config.json'), 'utf8')).mode, 'static-portal');
  await assert.rejects(readFile(path.join(output, '.env')));
  await assert.rejects(readFile(path.join(output, 'server', 'index.js')));
  assert.doesNotMatch(await readFile(path.join(output, 'index.html'), 'utf8'), /本地助手|检测助手|starport:\/\//);
  await assert.rejects(readFile(path.join(output, 'downloads', 'starport-helper-windows.zip')));
  const total = JSON.parse(await readFile(path.join(output, 'data', 'all-all-1.json'), 'utf8'));
  assert.equal(total.total, 1);
  assert.match(total.scope, /当前发布前 1 个/);
});
