import { validRepository } from './selection.js';

export function cloneCommands(repositories, directory = '', shell = 'powershell') {
  if (!repositories.length || repositories.length > 100 || !repositories.every(validRepository)) throw new Error('请选择有效的 GitHub 项目。');
  const base = directory.trim();
  if (base.length > 2000 || /[\u0000-\u001f\u007f]/.test(base)) throw new Error('目录不能包含换行或控制字符。');
  const quote = value => shell === 'powershell' ? `'${value.replaceAll("'", "''")}'` : `'${value.replaceAll("'", "'\\''")}'`;
  return repositories.map(repo => {
    const destination = base ? `${base.replace(/[\\/]+$/, '')}/${repo}` : repo;
    return `git clone -- https://github.com/${repo}.git ${quote(destination)}`;
  }).join('\n');
}

export function sourceZipUrl(repo) {
  if (!validRepository(repo)) throw new Error('项目名称无效。');
  return `https://codeload.github.com/${repo}/zip/HEAD`;
}
