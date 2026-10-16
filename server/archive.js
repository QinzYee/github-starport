// 云端打包：把选中的仓库源码抓到服务器内存，合并成一个 ZIP 直接回传浏览器。
// 全程不写服务器磁盘、不执行 Git、不运行下载到的代码、不保留任何副本。
import AdmZip from 'adm-zip';

export const archiveLimits = {
  repositories: 10,
  entryBytes: 120 * 1024 * 1024,
  bundleBytes: 150 * 1024 * 1024,
  files: 20000,
  // 单个仓库的抓取超时，以及整次打包的时间预算。
  // 预算必须明显小于公网反向代理的网关超时（实测 60 秒），否则用户只会看到一个 504，
  // 而现在会拿到已经打包好的部分结果和每个仓库的失败原因。
  timeout: 20000,
  budget: 45000
};

// 与 archiveEntries 不同：这里不落盘，只需保证合并后的 ZIP 里没有可逃逸的路径。
// 单个条目不安全就跳过，不让一个坏文件毁掉整批。
export function safeEntries(zip) {
  const entries = zip.getEntries();
  if (entries.length > archiveLimits.files) throw new Error(`文件过多（上限 ${archiveLimits.files}）。`);
  const roots = new Set(entries.map(entry => entry.entryName.split('/')[0]));
  if (roots.size !== 1) throw new Error('源码包根目录格式异常。');
  const safe = [];
  for (const entry of entries) {
    const name = entry.entryName;
    if (name.includes('\\') || name.startsWith('/') || name.split('/').includes('..')) continue;
    const relative = name.split('/').slice(1).join('/');
    if (!relative || entry.isDirectory) continue;
    if (/[\x00-\x1f]/.test(relative)) continue;
    const mode = (entry.header.attr >>> 16) & 0xf000;
    if (mode === 0xa000) continue; // 符号链接对下载者没有意义
    safe.push({ relative, data: entry.getData() });
  }
  if (!safe.length) throw new Error('源码包中没有可用文件。');
  return safe;
}

export async function fetchSourceZip(repo, { signal, log, timeout = archiveLimits.timeout } = {}) {
  const combined = AbortSignal.any([signal, AbortSignal.timeout(timeout)].filter(Boolean));
  // HEAD 跟随默认分支；ZIP 注释里记录了准确的提交 SHA，因此不消耗 REST API 配额。
  const response = await fetch(`https://codeload.github.com/${repo}/zip/HEAD`, { signal: combined });
  if (!response.ok) throw new Error(`源码 ZIP 下载失败：HTTP ${response.status}`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > archiveLimits.entryBytes) {
      await response.body.cancel().catch(() => {});
      throw new Error(`源码包超过 ${archiveLimits.entryBytes / 1024 / 1024} MB。`);
    }
    chunks.push(chunk);
  }
  const zip = new AdmZip(Buffer.concat(chunks));
  const sha = zip.getZipComment().trim();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('源码包缺少可验证的 Git 提交标识。');
  log?.(`${repo}：已接收 ${(size / 1024 / 1024).toFixed(1)} MB，提交 ${sha.slice(0, 7)}`);
  return { zip, sha };
}

export function bundleFilename(at = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(at).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `starport-${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}.zip`;
}

export async function createBundle(repositories, { signal, log, budget = archiveLimits.budget, timeout = archiveLimits.timeout } = {}) {
  const output = new AdmZip();
  const report = [];
  const deadline = Date.now() + budget;
  let bytes = 0;
  for (const repo of repositories) {
    signal?.throwIfAborted();
    if (Date.now() >= deadline) {
      report.push({ repo, status: 'failed', message: '本次打包的时间预算已用完，请减少项目数量后重试。' });
      log?.(`${repo}：跳过（时间预算已用完）`);
      continue;
    }
    try {
      const { zip, sha } = await fetchSourceZip(repo, { signal, log, timeout: Math.min(timeout, Math.max(2000, deadline - Date.now())) });
      const entries = safeEntries(zip);
      for (const entry of entries) {
        bytes += entry.data.length;
        if (bytes > archiveLimits.bundleBytes) throw new Error(`合并体积超过 ${archiveLimits.bundleBytes / 1024 / 1024} MB。`);
        output.addFile(`${repo}/${entry.relative}`, entry.data);
      }
      report.push({ repo, status: 'completed', sha, files: entries.length });
      log?.(`${repo}：${entries.length} 个文件已加入打包`);
    } catch (error) {
      if (signal?.aborted) throw error;
      const message = error.name === 'TimeoutError' ? '抓取超时，已跳过（该仓库太大或源码域名不可达）。' : error.message;
      report.push({ repo, status: 'failed', message });
      log?.(`${repo}：跳过（${message}）`);
    }
  }
  if (!report.some(item => item.status === 'completed')) {
    throw new Error(report.map(item => `${item.repo}：${item.message}`).join('；') || '没有可打包的仓库。');
  }
  return { buffer: output.toBuffer(), report, filename: bundleFilename() };
}
