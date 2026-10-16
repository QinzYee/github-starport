// Real-network verification in an isolated local service. Does not touch the user's download history.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, access } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(path.join(os.tmpdir(), 'starport-smoke-'));
const socket = createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const child = spawn(process.execPath, ['server/index.js'], { cwd: root, env: { ...process.env, PORT: String(port), PUBLIC_MODE: '0', DATA_DIR: path.join(temp, 'data') }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
const exited = new Promise(resolve => child.once('exit', resolve));
const base = `http://127.0.0.1:${port}`;
let config;
const request = async (url, body) => {
  const response = await fetch(base + url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Local-Token': config.csrfToken }, body: JSON.stringify(body) } : {});
  const data = await response.json();
  assert.ok(response.ok, JSON.stringify(data));
  return data;
};
try {
  for (let n = 0; n < 100; n++) {
    try { config = await request('/api/config'); break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert.ok(config, 'local service did not start');
  const forbidden = await fetch(base + '/api/downloads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(forbidden.status, 403, 'mutations require session token');
  const crossOrigin = await fetch(base + '/api/config', { headers: { Origin: 'https://example.com' } });
  assert.equal(crossOrigin.status, 403);
  if (!process.argv.includes('--downloads-only')) {
  const rankings = await Promise.all(['daily', 'weekly', 'monthly', 'all'].map(async period => {
    const result = await request(`/api/rankings?period=${period}`);
    assert.ok(result.repositories.length > 0);
    const values = result.repositories.map(repo => period === 'all' ? repo.stars : repo.periodStars);
    assert.deepEqual(values, [...values].sort((a, b) => b - a));
    return { period, source: result.source, count: result.repositories.length, stale: result.stale, dataAt: result.dataAt };
  }));
  console.log('Real rankings:', JSON.stringify(rankings));
  }
  const directory = path.join(temp, 'projects');
  const git = await request('/api/downloads', { repositories: ['octocat/Hello-World', 'octocat/git-consortium'], directory, method: 'git', shallow: true });
  const zip = await request('/api/downloads', { repositories: ['octocat/Spoon-Knife'], directory, method: 'zip', shallow: true });
  const ids = [...git.jobs, ...zip.jobs].map(job => job.id);
  let jobs;
  for (let n = 0; n < 180; n++) {
    jobs = (await request('/api/downloads')).jobs.filter(job => ids.includes(job.id));
    if (jobs.every(job => !['queued', 'running'].includes(job.status))) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.log('Real downloads:', JSON.stringify(jobs.map(({ repo, method, status, message, commit }) => ({ repo, method, status, message, commit }))));
  for (const job of jobs) {
    assert.equal(job.status, 'completed', `${job.repo}: ${job.message}`);
    if (job.method === 'git') await access(path.join(job.path, '.git', 'HEAD'));
    else await access(path.join(job.path, 'README.md'));
  }
  assert.match(await readFile(path.join(directory, 'octocat', 'Hello-World', 'README'), 'utf8'), /Hello World/i);
  const [first] = git.jobs;
  const skipped = await request(`/api/downloads/${first.id}/retry`, {});
  for (let n = 0; n < 100; n++) {
    const retried = (await request('/api/downloads')).jobs.find(job => job.id === skipped.jobs[0].id);
    if (retried.status === 'skipped') break;
    if (n === 99) assert.fail('existing directory was not skipped');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  console.log(`PASS: ${process.argv.includes('--downloads-only') ? '' : 'real rankings, '}two concurrent Git clones, ZIP snapshot, filesystem contents, no-overwrite and HTTP protections.`);
} finally {
  child.kill(); await exited;
  // The exact directory is created by mkdtemp above, outside user repositories.
  assert.ok(path.dirname(temp) === os.tmpdir() && path.basename(temp).startsWith('starport-smoke-'));
  await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}
