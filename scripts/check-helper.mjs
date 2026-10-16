import { mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import AdmZip from 'adm-zip';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(path.join(os.tmpdir(), 'starport-helper-qa-'));
let child, exited;
try {
  const zip = new AdmZip(path.join(root, '.data', 'release', 'starport-helper-windows.zip'));
  assert.ok(!zip.getEntries().some(entry => /\.env$|\/\.data\/|\/wrangler\/|\/miniflare\//.test(entry.entryName)));
  zip.extractAllTo(temp);
  const helper = path.join(temp, 'starport-helper');
  const selection = await import(pathToFileURL(path.join(helper, 'public', 'selection.js')));
  assert.deepEqual(selection.parseHelperLink(selection.helperLink(selection.selectionDocument(['octocat/Hello-World']))).repositories, ['octocat/Hello-World']);
  const socket = createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  child = spawn(process.execPath, ['server/index.js'], { cwd: helper, env: { ...process.env, PORT: String(port), PUBLIC_MODE: '0', STARPORT_OPEN: '0' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  exited = new Promise(resolve => child.once('exit', resolve));
  let errorLog = ''; child.stderr.on('data', chunk => { errorLog += chunk.toString(); });
  let config;
  for (let i = 0; i < 100; i++) {
    try { config = await (await fetch(`http://127.0.0.1:${port}/api/config`)).json(); break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert.equal(config?.applicationId, 'starport', `extracted helper failed startup: ${errorLog}`);
  assert.equal(config.publicMode, false);
  const jobs = await (await fetch(`http://127.0.0.1:${port}/api/downloads`)).json();
  assert.equal(jobs.jobs.length, 0);
  console.log('PASS: extracted helper starts with packaged production dependencies; protocol manifest round-trip and no automatic downloads verified. No registry changes made.');
} finally {
  if (child && child.exitCode === null) child.kill();
  if (exited) await exited;
  assert.ok(path.dirname(temp) === os.tmpdir() && path.basename(temp).startsWith('starport-helper-qa-'));
  await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
