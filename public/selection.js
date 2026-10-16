// This manifest contains repository names only: never paths, commands, credentials or auto-run flags.
export function validRepository(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}\/[a-zA-Z0-9_.-]{1,100}$/.test(value)
    && !value.split('/').some(p => p === '.' || p === '..' || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p));
}
export function selectionDocument(repositories) {
  return validateSelection({ format: 'starport-selection', version: 1, repositories });
}
export function validateSelection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(k => !['format', 'version', 'repositories'].includes(k))
    || value.format !== 'starport-selection' || value.version !== 1
    || !Array.isArray(value.repositories) || !value.repositories.length || value.repositories.length > 100
    || !value.repositories.every(validRepository)) throw new Error('清单格式无效：只接受 1–100 个 GitHub 仓库名称。');
  return { format: 'starport-selection', version: 1, repositories: [...new Set(value.repositories)] };
}
export function encodeSelection(value) {
  const text = JSON.stringify(validateSelection(value));
  const bytes = new TextEncoder().encode(text);
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export function decodeSelection(encoded) {
  if (typeof encoded !== 'string' || encoded.length > 22000 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('项目清单链接无效或过长，请改用清单文件。');
  const binary = atob(encoded.replaceAll('-', '+').replaceAll('_', '/'));
  return validateSelection(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, c => c.charCodeAt(0)))));
}
export function helperLink(value) {
  const link = `starport://import?data=${encodeSelection(value)}`;
  if (link.length > 22000) throw new Error('所选项目名称较长，请下载清单文件再导入本地助手。');
  return link;
}
export function parseHelperLink(value) {
  if (typeof value !== 'string' || value.length > 22500) throw new Error('助手链接无效。');
  const url = new URL(value);
  if (url.protocol !== 'starport:' || url.hostname !== 'import' || url.username || url.password || url.port || url.hash
    || (url.pathname && url.pathname !== '/') || [...url.searchParams.keys()].some(k => k !== 'data')
    || url.searchParams.getAll('data').length !== 1) throw new Error('只支持 Starport 项目清单链接。');
  return decodeSelection(url.searchParams.get('data'));
}
