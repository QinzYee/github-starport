import { validateSelection, decodeSelection, validRepository } from './selection.js';
import { getStaticRanking, availableLanguages } from './portal.js';
import { cloneCommands, sourceZipUrl } from './commands.js';
const paths = {
  orbit: '<path d="m12 3 2.8 5.6 6.2.9-4.5 4.4 1.1 6.1-5.6-2.9-5.6 2.9 1.1-6.1L3 9.5l6.2-.9Z"/><path d="M3 3h3M4.5 1.5v3M20 19h3M21.5 17.5v3"/>',
  chart: '<path d="M4 3v17h17M8 14l4-5 4 3 5-7"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  checkbox: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m7 12 3 3 7-7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  monitor: '<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M8 21h8m-4-5v5"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-2l2 2M4 17l2 2a7 7 0 0 0 12-2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  folder: '<path d="M3 7V5h6l2 3h10v12H3Z"/>',
  'folder-open': '<path d="M3 10V5h6l2 3h10v3M3 20l3-9h16l-3 9Z"/>',
  shield: '<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  'arrow-right': '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  key: '<circle cx="8" cy="8" r="4"/><path d="m11 11 10 10m-4-4 3-3m-6 0 3-3"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
  external: '<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>',
  fork: '<circle cx="6" cy="4" r="2"/><circle cx="18" cy="4" r="2"/><circle cx="12" cy="20" r="2"/><path d="M6 6v3c0 4 12 4 12 0V6m-6 7v5"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3m6 0h4"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  inbox: '<path d="m3 13 3-9h12l3 9v7H3Zm0 0h5l2 3h4l2-3h5"/>',
  cloud: '<path d="M7 18a4 4 0 0 1 .6-7.9A5.5 5.5 0 0 1 18 11.6 3.5 3.5 0 0 1 17.5 18Z"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.info}</svg>`;
document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const format = value => new Intl.NumberFormat('en-US').format(value || 0);
const date = value => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '未知';
const periodLabel = { daily: '今日', weekly: '本周', monthly: '本月', all: '累计' };
const periodLimit = { daily: 10, weekly: 20, monthly: 50, all: 50 };
const pageSize = 10;
const stateNames = { queued: '等待中', running: '下载中', completed: '已完成', failed: '失败', skipped: '已跳过', cancelled: '已取消', interrupted: '已中断' };
const state = { period: 'daily', page: 1, data: null, selected: new Map(), config: null, jobs: [], view: 'rankings', loading: false, requestId: 0, submitting: false, pollFailed: false };
const cloudMode = () => Boolean(state.config?.publicMode);
const portalMode = () => state.config?.mode === 'static-portal';
const selectLimit = () => cloudMode() ? (state.config.maxRepos || 10) : 100;
let toastTimer;
function toast(message, error = false) {
  $('toast').textContent = message;
  $('toast').classList.toggle('error', error);
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 8000 : 4000);
}
async function api(url, options = {}) {
  if (portalMode()) {
    if (url.startsWith('/api/rankings?')) return getStaticRanking(new URL(url, location.origin).searchParams);
    throw new Error('此功能仅在本机运行模式下提供。');
  }
  const headers = { ...options.headers };
  if (options.body) headers['Content-Type'] = 'application/json';
  if (options.method && options.method !== 'GET') headers['X-Local-Token'] = state.config?.csrfToken || '';
  const response = await fetch(url, { ...options, headers });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `请求失败 (${response.status})`);
  return result;
}
function post(url, body = {}) { return api(url, { method: 'POST', body: JSON.stringify(body) }); }
function persistSelection() {
  try { localStorage.setItem('starport-selection', JSON.stringify([...state.selected.values()])); } catch { /* storage may be unavailable */ }
}
function setView(view) {
  state.view = view;
  $('rankings-view').hidden = view !== 'rankings';
  $('downloads-view').hidden = view !== 'downloads';
  document.querySelectorAll('[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  if (view === 'downloads') renderHistory();
}
document.querySelectorAll('[data-view]').forEach(el => el.addEventListener('click', () => setView(el.dataset.view)));
$('view-history').addEventListener('click', () => { setView('downloads'); $('main').focus(); });

async function loadRanking(refresh = false) {
  const requestId = ++state.requestId;
  state.loading = true;
  state.data = null;
  $('table-wrap').hidden = true;
  $('pagination').hidden = true;
  $('data-footer').hidden = true;
  $('notice').hidden = true;
  $('select-all').checked = false;
  $('select-all').indeterminate = false;
  $('select-all').disabled = true;
  $('refresh').disabled = true;
  $('results-count').textContent = '正在获取榜单…';
  $('ranking-status').hidden = false;
  $('ranking-status').innerHTML = `<span class="loader"></span><h2>${portalMode() ? '正在读取榜单' : '正在连接 GitHub'}</h2><p>${portalMode() ? '加载最近发布的榜单快照，请稍候。' : '直连不可用时会尝试公开快照，请稍候。'}</p>`;
  const params = new URLSearchParams({ period: state.period, language: $('language').value, page: '1' });
  if (refresh) params.set('refresh', '1');
  try {
    if (portalMode()) {
      const response = await fetch('./data/manifest.json', { cache: refresh ? 'reload' : 'no-cache' });
      if (!response.ok) throw new Error('榜单索引暂时不可用，请稍后刷新。');
      const catalog = await response.json();
      if (requestId !== state.requestId) return;
      const published = availableLanguages(catalog, params.get('period'));
      let missing = 0;
      for (const option of $('language').options) { option.disabled = !published.has(option.value.toLowerCase()); if (option.disabled) missing++; }
      if ($('language').selectedOptions[0]?.disabled) { $('language').value = ''; params.set('language', ''); toast('该语言的本期榜单尚未发布，已切换为全部语言。'); }
      $('language-availability').hidden = !missing;
    }
    const data = await api(`/api/rankings?${params}`);
    if (requestId !== state.requestId) return;
    state.data = data;
    state.loading = false;
    renderRanking();
    renderMetadata();
  } catch (error) {
    if (requestId !== state.requestId) return;
    state.loading = false;
    $('results-count').textContent = '获取失败';
    $('ranking-status').innerHTML = `${icon('inbox')}<h2>暂时无法获取榜单</h2><p>${escape(error.message)}</p><button class="button secondary" id="retry-ranking">重新获取</button>`;
    $('retry-ranking').addEventListener('click', () => loadRanking(true));
  } finally {
    if (requestId === state.requestId) $('refresh').disabled = false;
  }
}
function matchingRepositories() {
  const query = $('search').value.toLowerCase().trim();
  const sort = $('sort').value;
  const repos = [...(state.data?.repositories || [])].slice(0, periodLimit[state.period]).sort((a, b) => (sort === 'growth' ? b.periodStars - a.periodStars : sort === 'forks' ? b.forks - a.forks : b.stars - a.stars) || b.stars - a.stars);
  return repos.map((repo, index) => ({ ...repo, rank: index + 1 })).filter(repo => `${repo.fullName} ${repo.description} ${repo.language || ''}`.toLowerCase().includes(query));
}
function filteredRepositories() { return matchingRepositories().slice((state.page - 1) * pageSize, state.page * pageSize); }
function renderRanking() {
  if (!state.data || state.loading) return;
  const matches = matchingRepositories();
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  state.page = Math.min(state.page, pages);
  const repos = filteredRepositories();
  $('growth-heading').textContent = state.period === 'all' ? '周期新增' : `${periodLabel[state.period]}新增`;
  $('results-count').textContent = matches.length ? `${(state.page - 1) * pageSize + 1}–${(state.page - 1) * pageSize + repos.length} / ${matches.length} 个项目` : '0 个项目';
  $('table-wrap').hidden = !repos.length;
  $('ranking-status').hidden = Boolean(repos.length);
  if (!repos.length) $('ranking-status').innerHTML = `${icon('search')}<h2>没有找到匹配项目</h2><p>试试其他关键词或编程语言。</p>`;
  const langClass = language => ({ Python: 'python', TypeScript: 'typescript', JavaScript: 'javascript', Go: 'go', Rust: 'rust', Java: 'java', 'C++': 'cpp', HTML: 'html' }[language] || 'other');
  $('repo-list').innerHTML = repos.map(repo => {
    const [owner, name] = repo.fullName.split('/');
    return `<tr data-repo="${escape(repo.fullName)}" class="${state.selected.has(repo.fullName) ? 'selected' : ''}">
      <td class="check-col"><input type="checkbox" data-select="${escape(repo.fullName)}" aria-label="选择 ${escape(repo.fullName)}" ${state.selected.has(repo.fullName) ? 'checked' : ''}></td>
      <td class="rank-col"><span class="${repo.rank <= 3 ? 'rank-top' : ''}">${String(repo.rank).padStart(2, '0')}</span></td>
      <td><a class="repo-link" href="https://github.com/${escape(repo.fullName)}" target="_blank" rel="noreferrer"><span class="repo-owner">${escape(owner)} / </span>${escape(name)}${icon('external')}</a><p class="repo-description">${escape(repo.description || '项目暂无简介')}</p><div class="repo-meta"><span class="language-label"><i class="language-dot lang-${langClass(repo.language)}"></i>${escape(repo.language || '未标注语言')}</span><span class="fork-count">${icon('fork')}${format(repo.forks)}</span></div></td>
      <td class="numeric growth">${repo.periodStars === null ? '—' : `+${format(repo.periodStars)}`}</td><td class="numeric">${format(repo.stars)}</td></tr>`;
  }).join('');
  $('select-all').disabled = !repos.length;
  updateChecks();
  $('pagination').hidden = !matches.length;
  $('previous').disabled = state.page <= 1;
  $('next').disabled = state.page >= pages;
  $('page-number').textContent = `第 ${state.page} / ${pages} 页`;
}
function renderMetadata() {
  const data = state.data;
  $('notice').hidden = !data.warning;
  if (data.warning) $('notice').innerHTML = `<strong>${data.stale ? '历史数据' : '数据提示'}</strong> · ${escape(data.warning)}${data.stale ? `<br>快照时间：${date(data.dataAt)}（北京时间）` : ''}`;
  $('data-footer').hidden = false;
  $('source-link').textContent = data.source;
  $('source-link').href = data.sourceUrl;
  $('cache-label').textContent = data.snapshot ? '· 定时快照' : data.cached ? '· 本地缓存' : '· 刚刚获取';
  $('data-date').textContent = `数据时间 ${date(data.dataAt)} CST`;
  $('data-date').title = `获取时间：${date(data.fetchedAt)}`;
  $('data-scope').textContent = `本榜最多展示 ${periodLimit[state.period]} 个项目，每页 ${pageSize} 条。${state.period === 'all' ? '公开非 Fork 仓库，按累计 Star 取前 50 个。' : '数据来自 GitHub Trending 候选集，不代表全站完整新增 Star 排名；候选不足时展示实际条数。'}${portalMode() ? ' 榜单定时更新，“刷新”读取最近发布的数据。' : ''}`;
}
function updateChecks() {
  const repos = filteredRepositories();
  const count = repos.filter(repo => state.selected.has(repo.fullName)).length;
  $('select-all').checked = repos.length > 0 && count === repos.length;
  $('select-all').indeterminate = count > 0 && count < repos.length;
  document.querySelectorAll('[data-select]').forEach(input => {
    input.checked = state.selected.has(input.dataset.select);
    input.closest('tr').classList.toggle('selected', input.checked);
  });
}
function renderSelection() {
  persistSelection();
  const count = state.selected.size;
  const blocked = !count || !state.config || state.submitting;
  $('selected-count').textContent = count;
  $('mobile-selection').hidden = !portalMode() || !count;
  $('mobile-selected-count').textContent = `已选 ${count} 个项目`;
  $('clear-selection').disabled = !count;
  $('download-button').disabled = blocked;
  $('bundle-button').disabled = blocked;
  $('download-zips').disabled = blocked || zipStarting;
  $('copy-commands').disabled = blocked;
  $('download-label').textContent = state.submitting ? '加入队列中…' : count ? `下载 ${count} 个项目` : '请选择项目';
  $('bundle-label').textContent = state.submitting ? '正在云端打包…' : count ? `打包下载 ${count} 个项目` : '请选择项目';
  const empty = portalMode() ? '勾选榜单中的项目<br><span>下载 ZIP，或复制克隆命令</span>' : cloudMode() ? '勾选左侧项目<br><span>在这里一起打包下载</span>' : '勾选左侧项目<br><span>在这里一起下载</span>';
  $('selected-list').innerHTML = count ? [...state.selected.values()].map(repo => `<div class="selected-item"><span class="selected-name">${escape(repo.fullName)}</span>${portalMode() ? `<a class="icon-button" href="${sourceZipUrl(repo.fullName)}" target="_blank" rel="noreferrer" aria-label="下载 ${escape(repo.fullName)} 的 ZIP" title="下载 ZIP">${icon('download')}</a><button class="icon-button" data-copy="${escape(repo.fullName)}" aria-label="复制 ${escape(repo.fullName)} 的克隆命令" title="复制克隆命令">${icon('terminal')}</button>` : ''}<button class="remove-button" data-remove="${escape(repo.fullName)}" aria-label="移除 ${escape(repo.fullName)}">${icon('close')}</button></div>`).join('') : `<div class="selection-empty"><span>${icon('checkbox')}</span><p>${empty}</p></div>`;
  updateChecks();
}

function saveFile(content, filename, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
const commandShell = /Win/i.test(navigator.platform) ? 'powershell' : 'posix';
async function copyCommands(repositories) {
  try {
    const commands = cloneCommands(repositories, $('clone-directory').value, commandShell);
    try { await navigator.clipboard.writeText(commands); toast(`已复制 ${repositories.length} 条克隆命令，请在${commandShell === 'powershell' ? ' PowerShell ' : '终端'}中运行。`); }
    catch { saveFile(commands + '\n', 'starport-commands.txt', 'text/plain'); toast('浏览器未允许复制，已保存命令文本文件。'); }
  } catch (error) { toast(error.message, true); }
}
$('copy-commands').addEventListener('click', () => copyCommands([...state.selected.keys()]));
$('clone-directory').addEventListener('input', () => { try { localStorage.setItem('starport-clone-directory', $('clone-directory').value); } catch { /* optional preference */ } });
let zipStarting = false;
$('download-zips').addEventListener('click', async () => {
  const repositories = [...state.selected.keys()];
  if (!repositories.length || zipStarting) return;
  zipStarting = true; renderSelection();
  $('download-feedback').hidden = false;
  try {
    for (let i = 0; i < repositories.length; i++) {
      const frame = document.createElement('iframe'); frame.hidden = true; frame.title = `下载 ${repositories[i]}`;
      frame.src = sourceZipUrl(repositories[i]); document.body.append(frame);
      setTimeout(() => frame.remove(), 120000);
      $('download-feedback').textContent = `已发起 ${i + 1} / ${repositories.length} 个下载请求。若浏览器询问，请允许多文件下载。`;
      if (i + 1 < repositories.length) await new Promise(resolve => setTimeout(resolve, 500));
    }
    $('download-feedback').textContent = `已发起 ${repositories.length} 个 ZIP 下载请求，请在浏览器查看结果。若被拦截，可使用项目旁的下载按钮。`;
  } finally { zipStarting = false; renderSelection(); }
});
function importRepositories(document) {
  const selection = validateSelection(document);
  for (const fullName of selection.repositories) { if (state.selected.size < 100) state.selected.set(fullName, { fullName }); }
  renderSelection();
  $('import-notice').hidden = false;
  $('import-notice').textContent = `已导入 ${selection.repositories.length} 个项目。请核对右侧项目和保存目录，再点击下载。尚未开始任何下载。`;
}
$('import-selection').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 65536) throw new Error('项目清单不得超过 64 KB。');
    importRepositories(JSON.parse(await file.text()));
  } catch (error) { toast(error.message, true); }
  finally { event.target.value = ''; }
});
function importFromHash() {
  if (!state.config || cloudMode() || !location.hash.startsWith('#import=')) return;
  try { importRepositories(decodeSelection(location.hash.slice(8))); }
  catch (error) { toast(error.message, true); }
  finally { history.replaceState(null, '', location.pathname + location.search); }
}
window.addEventListener('hashchange', importFromHash);
$('repo-list').addEventListener('change', event => {
  const name = event.target.dataset.select;
  if (!name) return;
  const repo = state.data.repositories.find(r => r.fullName === name);
  if (event.target.checked) {
    if (state.selected.size >= 100) { event.target.checked = false; toast('一次最多选择 100 个项目。', true); return; }
    state.selected.set(name, repo);
    event.target.closest('tr').classList.add('selection-flash');
  } else state.selected.delete(name);
  renderSelection();
});
$('select-all').addEventListener('change', event => {
  const checked = event.target.checked;
  for (const repo of filteredRepositories()) {
    if (checked && state.selected.size < selectLimit()) state.selected.set(repo.fullName, repo);
    if (!checked) state.selected.delete(repo.fullName);
  }
  if (checked && state.selected.size >= selectLimit()) toast(`每批最多选择 ${selectLimit()} 个项目。`);
  renderSelection();
});
$('selected-list').addEventListener('click', event => {
  const copy = event.target.closest('[data-copy]');
  if (copy) { copyCommands([copy.dataset.copy]); return; }
  const button = event.target.closest('[data-remove]');
  if (button) { state.selected.delete(button.dataset.remove); renderSelection(); }
});
$('clear-selection').addEventListener('click', () => { state.selected.clear(); renderSelection(); });
$('search').addEventListener('input', () => { state.page = 1; renderRanking(); });
$('sort').addEventListener('change', () => { state.page = 1; renderRanking(); });
$('language').addEventListener('change', () => { state.page = 1; loadRanking(); });
$('refresh').addEventListener('click', () => loadRanking(true));
function switchPeriod(period) {
  if (period === state.period && state.data) return;
  state.period = period;
  state.page = 1;
  $('sort').value = period === 'all' ? 'stars' : 'growth';
  $('sort').querySelector('[value="growth"]').disabled = period === 'all';
  $('sort').querySelector('[value="growth"]').textContent = period === 'all' ? '总榜无周期新增数据' : '新增 Star 优先';
  document.querySelectorAll('[data-period]').forEach(button => {
    const selected = button.dataset.period === period;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', selected);
    button.tabIndex = selected ? 0 : -1;
  });
  $('ranking-panel').setAttribute('aria-labelledby', `tab-${period}`);
  loadRanking();
}
document.querySelectorAll('[data-period]').forEach(button => {
  button.addEventListener('click', () => switchPeriod(button.dataset.period));
  button.addEventListener('keydown', event => {
    const buttons = [...document.querySelectorAll('[data-period]')];
    let index = buttons.indexOf(button);
    if (event.key === 'ArrowRight') index = (index + 1) % buttons.length;
    else if (event.key === 'ArrowLeft') index = (index + buttons.length - 1) % buttons.length;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = buttons.length - 1;
    else return;
    event.preventDefault(); buttons[index].focus(); switchPeriod(buttons[index].dataset.period);
  });
});
$('previous').addEventListener('click', () => { if (state.page > 1) { state.page--; renderRanking(); } });
$('next').addEventListener('click', () => { if (state.page * pageSize < matchingRepositories().length) { state.page++; renderRanking(); } });
function methodChanged() {
  const zip = $('method').value === 'zip';
  $('shallow').disabled = zip;
  $('method-help').textContent = zip ? '下载默认分支的源码快照；不含 .git 和提交历史。' : '保留 .git 目录；取消勾选可下载完整提交历史。';
}
$('method').addEventListener('change', methodChanged);
$('browse').addEventListener('click', async () => {
  $('browse').disabled = true;
  try { const result = await post('/api/directory/pick'); if (result.directory) $('directory').value = result.directory; }
  catch (error) { toast(error.message, true); }
  finally { $('browse').disabled = false; }
});
$('download-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!state.selected.size || state.submitting) return;
  const chosen = [...state.selected.keys()];
  state.submitting = true; renderSelection();
  try {
    const result = await post('/api/downloads', { repositories: chosen, directory: $('directory').value.trim(), shallow: $('shallow').checked, method: $('method').value });
    for (const name of chosen) state.selected.delete(name);
    toast(`${result.jobs.length} 个项目已加入下载队列`);
    await pollJobs();
  } catch (error) { toast(error.message, true); }
  finally { state.submitting = false; renderSelection(); }
});
// 云端模式：选中的仓库由服务端抓取源码并合并成一个 ZIP 回传浏览器，不写服务器磁盘。
let bundleTimer;
function decodeReport(value) {
  if (!value) return [];
  try { return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value), char => char.charCodeAt(0)))); } catch { return []; }
}
function bundleItem(item) {
  const ok = item.status === 'completed';
  return `<div class="bundle-item"><span class="bundle-state ${ok ? 'ok' : 'bad'}">${icon(ok ? 'check' : 'close')}</span><span class="bundle-name">${escape(item.repo)}</span><span class="bundle-meta">${escape(ok ? `${item.files} 个文件` : item.message || '跳过')}</span></div>`;
}
function setBundleStatus(kind, report = [], filename = '', message = '') {
  const box = $('bundle-status');
  clearInterval(bundleTimer);
  box.hidden = false;
  if (kind === 'running') {
    let seconds = 0;
    box.innerHTML = `<p class="bundle-heading"><span class="loader"></span>正在云端抓取 ${report.length} 个项目的源码…已用 <span id="bundle-elapsed">0</span> 秒</p><p class="field-help">合并完成后浏览器会自动保存 ZIP，请勿关闭页面。</p>`;
    bundleTimer = setInterval(() => { seconds++; const elapsed = $('bundle-elapsed'); if (elapsed) elapsed.textContent = seconds; }, 1000);
    return;
  }
  if (kind === 'failed') {
    box.innerHTML = `<p class="bundle-heading error">${icon('close')}打包失败</p><p class="field-help">${escape(message)}</p>`;
    return;
  }
  const done = report.filter(item => item.status === 'completed').length;
  box.innerHTML = `<p class="bundle-heading">${icon('check')}已打包 ${done} 个项目 · <span class="bundle-file">${escape(filename)}</span></p>${report.map(bundleItem).join('')}`;
}
$('bundle-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!state.selected.size || state.submitting) return;
  const chosen = [...state.selected.keys()];
  if (chosen.length > selectLimit()) { toast(`云端一次最多打包 ${selectLimit()} 个项目，请分批下载。`, true); return; }
  state.submitting = true;
  renderSelection();
  setBundleStatus('running', chosen.map(repo => ({ repo })));
  try {
    const response = await fetch('/api/archive', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Local-Token': state.config.csrfToken }, body: JSON.stringify({ repositories: chosen }) });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      throw new Error(failure.error || `打包失败（HTTP ${response.status}）。`);
    }
    const blob = await response.blob();
    const filename = (response.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'starport.zip';
    const report = decodeReport(response.headers.get('X-Archive-Report'));
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    setBundleStatus('completed', report.length ? report : chosen.map(repo => ({ repo, status: 'completed', files: 0 })), filename);
    const failed = report.filter(item => item.status === 'failed');
    for (const item of report) if (item.status === 'completed') state.selected.delete(item.repo);
    toast(failed.length ? `${report.length - failed.length} 个项目已打包，${failed.length} 个失败` : `${chosen.length} 个项目已打包，浏览器开始保存 ${filename}`);
  } catch (error) {
    setBundleStatus('failed', [], '', error.message);
    toast(error.message, true);
  } finally {
    state.submitting = false;
    renderSelection();
  }
});
function applyMode() {
  if (!cloudMode()) return;
  const limit = selectLimit();
  if (state.selected.size > limit) {
    for (const name of [...state.selected.keys()].slice(limit)) state.selected.delete(name);
    toast(`云端一次最多打包 ${limit} 个项目，已保留前 ${limit} 个。`);
  }
  document.body.classList.add('cloud-mode');
  $('download-form').hidden = true;
  if (portalMode()) {
    $('portal-form').hidden = false;
    $('bundle-form').hidden = true;
    $('nav-downloads').hidden = true;
    $('queue-section').hidden = true;
    $('token-help').hidden = true;
    $('refresh').title = '读取最新已发布快照，榜单通常每小时更新';
    return;
  }
  $('bundle-form').hidden = false;
  $('nav-downloads').hidden = true;
  $('queue-section').hidden = true;
  $('token-help').hidden = true;
  $('side-guide').innerHTML = '<h2>带走源码</h2><p>发现项目，勾选收藏，<br>云端打包成一个 ZIP 下载。</p>'
    + '<div class="guide-line"><span data-icon="check"></span>日 / 周 / 月新增 Star</div>'
    + '<div class="guide-line"><span data-icon="check"></span>累计 Star 总榜</div>'
    + `<div class="guide-line"><span data-icon="check"></span>一次最多打包 ${limit} 个</div>`;
  $('side-guide').querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
}
function badge(job) { return `<span class="job-badge ${job.status}">${escape(stateNames[job.status] || job.status)}</span>`; }function renderQueue() {
  const jobs = state.jobs;
  $('history-count').textContent = jobs.length;
  const active = jobs.filter(job => ['queued', 'running'].includes(job.status));
  const recent = [...active, ...jobs.filter(job => !['queued', 'running'].includes(job.status))].slice(0, 3);
  $('queue-preview').innerHTML = recent.length ? recent.map(job => `<div class="queue-item"><div class="queue-item-name">${escape(job.repo)}</div><div class="queue-item-meta">${badge(job)}<span>${job.method === 'zip' ? '源码 ZIP' : 'Git 克隆'}</span></div>${job.status === 'running' ? `<progress ${job.progress ? `value="${job.progress}" max="100"` : ''} aria-label="${escape(job.repo)} 下载进度"></progress>` : ''}${job.status === 'failed' ? '<p class="queue-error">下载失败，查看全部记录可重试或改用 ZIP。</p>' : ''}</div>`).join('') : '<p class="queue-empty">还没有下载任务</p>';
}
function renderHistory() {
  const filter = $('history-filter').value;
  const active = job => ['queued', 'running'].includes(job.status);
  const jobs = state.jobs.filter(job => filter === 'all' || (filter === 'active' ? active(job) : filter === 'failed' ? ['failed', 'interrupted'].includes(job.status) : job.status === filter));
  $('history-summary').textContent = `${state.jobs.filter(active).length} 个进行中 · ${state.jobs.filter(j => j.status === 'completed').length} 个已完成`;
  $('history-list').innerHTML = jobs.length ? jobs.map(job => `<article class="history-item"><div class="history-top"><a class="history-name" href="https://github.com/${escape(job.repo)}" target="_blank" rel="noreferrer">${escape(job.repo)}</a>${badge(job)}</div><p class="job-path">${escape(job.path)}</p><p class="job-message">${escape(job.message)}</p>${job.commit ? `<p class="job-path">快照提交：${escape(job.commit.slice(0, 12))}</p>` : ''}${job.logs?.length ? `<details><summary>查看下载日志</summary><pre>${escape(job.logs.join('\n'))}</pre></details>` : ''}<div class="history-bottom"><span>${date(job.createdAt)}</span><span>${job.method === 'zip' ? '源码 ZIP' : job.shallow ? '浅克隆' : '完整克隆'}</span><div class="history-actions">${active(job) ? `<button class="text-button" data-job="${job.id}" data-action="cancel">取消任务</button>` : `<button class="text-button" data-job="${job.id}" data-action="retry">重新下载</button>`}${job.status === 'failed' && job.method === 'git' ? `<button class="text-button" data-job="${job.id}" data-action="zip">改用源码 ZIP</button>` : ''}${job.status === 'completed' ? `<button class="text-button" data-job="${job.id}" data-action="open">打开目录${icon('external')}</button>` : ''}</div></div></article>`).join('') : `<div class="empty-state">${icon('inbox')}<h2>${filter === 'all' ? '还没有下载记录' : '没有符合条件的任务'}</h2><p>在热门榜单勾选项目，选择保存目录后开始下载。</p><button class="button secondary" id="back-rankings">浏览热门榜单</button></div>`;
  $('back-rankings')?.addEventListener('click', () => setView('rankings'));
}
let jobSnapshot = '';
async function pollJobs() {
  try {
    const result = await api('/api/downloads');
    state.jobs = result.jobs;
    state.pollFailed = false;
    const snapshot = JSON.stringify(result.jobs);
    if (snapshot !== jobSnapshot) { jobSnapshot = snapshot; renderQueue(); if (state.view === 'downloads') renderHistory(); }
  } catch {
    state.pollFailed = true;
  }
}
$('history-filter').addEventListener('change', renderHistory);
$('history-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  button.disabled = true;
  try {
    if (button.dataset.action === 'zip') {
      const job = state.jobs.find(j => j.id === button.dataset.job);
      await post('/api/downloads', { repositories: [job.repo], directory: job.directory, shallow: true, method: 'zip' });
      toast('已加入源码 ZIP 下载队列');
    } else await post(`/api/downloads/${button.dataset.job}/${button.dataset.action}`);
    await pollJobs();
  } catch (error) { toast(error.message, true); }
  finally { button.disabled = false; }
});
async function initialize() {
  try {
    const chosen = JSON.parse(localStorage.getItem('starport-selection') || '[]');
    for (const repo of chosen.slice(0, 100)) if (repo && validRepository(repo.fullName)) state.selected.set(repo.fullName, { fullName: repo.fullName });
    $('clone-directory').value = localStorage.getItem('starport-clone-directory') || '';
  } catch { /* ignore invalid saved state */ }
  renderSelection();
  try {
    const portal = await fetch('./app-config.json', { cache: 'no-cache' }).then(response => response.ok ? response.json() : null).catch(() => null);
    state.config = portal?.mode === 'static-portal' ? portal : await api('/api/config');
    $('token-status').textContent = state.config.tokenConfigured ? '已配置 Token' : '匿名访问';
    if (cloudMode()) {
      applyMode();
      renderSelection();
      loadRanking();
      return;
    }
    $('directory').value = state.config.directory;
    $('method').value = state.config.method;
    $('shallow').checked = state.config.shallow;
    $('browse').hidden = state.config.platform !== 'win32';
    if (!state.config.gitAvailable && $('method').value === 'git') { $('method').value = 'zip'; toast('未检测到 Git，已选择源码 ZIP。'); }
    methodChanged();
    renderSelection();
    $('local-import').hidden = false;
    importFromHash();
    pollJobs();
    loadRanking();
  } catch (error) {
    $('ranking-status').innerHTML = `${icon('inbox')}<h2>服务未连接</h2><p>${cloudMode() ? '云端服务暂时不可用，请稍后刷新。' : '请运行启动脚本，然后刷新页面。'}${escape(error.message)}</p>`;
  }
  // Poll only after the previous request finishes; keep user selection untouched.
  const poll = async () => { await pollJobs(); setTimeout(poll, document.hidden ? 10000 : 2000); };
  setTimeout(poll, 2000);
}
initialize();
