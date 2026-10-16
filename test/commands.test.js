import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cloneCommands, sourceZipUrl } from '../public/commands.js';

test('克隆命令保留完整历史并按作者区分同名项目', () => {
  assert.equal(cloneCommands(['a/repo', 'b/repo']), "git clone -- https://github.com/a/repo.git 'a/repo'\ngit clone -- https://github.com/b/repo.git 'b/repo'");
  assert.equal(cloneCommands(['a/repo'], 'F:\\My Projects\\'), "git clone -- https://github.com/a/repo.git 'F:\\My Projects/a/repo'");
});
test('目录中的单引号、变量与命令替换按字面量引用', () => {
  assert.equal(cloneCommands(['a/b'], "F:/O'Brien/$(calc)", 'powershell'), "git clone -- https://github.com/a/b.git 'F:/O''Brien/$(calc)/a/b'");
  assert.equal(cloneCommands(['a/b'], "/tmp/O'Brien/$(id)", 'posix'), "git clone -- https://github.com/a/b.git '/tmp/O'\\''Brien/$(id)/a/b'");
  assert.throws(() => cloneCommands(['a/b'], 'C:/repos\ncalc'));
  assert.throws(() => cloneCommands(['a/b;calc']));
  assert.throws(() => cloneCommands([]));
});
test('ZIP 链接只接受有效仓库并直接使用 GitHub 源码下载域名', () => {
  assert.equal(sourceZipUrl('octocat/Hello-World'), 'https://codeload.github.com/octocat/Hello-World/zip/HEAD');
  assert.throws(() => sourceZipUrl('https://evil.test/a'));
});
