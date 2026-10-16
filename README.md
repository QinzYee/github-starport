# Starport · GitHub 热门项目

中文 GitHub 榜单与批量下载工具。推荐以纯静态公网网站提供榜单和源码下载，本地助手按需安装以解锁完整 Git 克隆。免费发布步骤见 [DEPLOYMENT.md](DEPLOYMENT.md)。原有本机模式和云端打包入口继续保留。

## 启动

需要 Node.js 22.19+；Git 克隆方式还需要 Git。Windows 双击 **start.cmd**，或在项目目录运行：

```powershell
npm install --ignore-scripts
npm start
```

打开 http://127.0.0.1:4317 。此命令只启动本机服务；公网静态版使用下述发布流程。

## 推荐：公网静态版与可选助手

```powershell
npm run data:update
npm run build:helper
npm run build:portal
npm run preview:portal
```

公网版无需安装即可浏览榜单、获取各仓库的原始源码 ZIP、复制克隆命令和导出项目清单。助手安装后可用 `starport://` 链接唤醒；也支持在本地页面导入清单。助手仅接收仓库名，确认目录并点击下载之前不会执行克隆。

`dist` 是上传到 Cloudflare 的静态文件，不包含本地服务、密钥和个人数据。GitHub Actions 定时更新榜单并发布；尚未完成账号授权时不会生成虚假的公网地址。详细账号配置、安装方式和额度边界见 [DEPLOYMENT.md](DEPLOYMENT.md)。

## 云端模式（公网访问）

同一份代码也能在公网运行，入口是 `server/cloud.js`：

```powershell
npm run start:cloud
```

云端容器的端口由平台通过 `PORT` 注入。两种模式的差异：

| | 本机模式（默认） | 云端模式 |
| --- | --- | --- |
| 监听 | 仅 `127.0.0.1`，只有本机能访问 | `0.0.0.0`，由平台反向代理到公网域名 |
| 榜单浏览 | 支持 | 支持 |
| 下载 | 克隆到你指定的本机目录，或源码 ZIP 解压到该目录 | 云端抓取源码，合并成一个 ZIP 回传浏览器，保存到你的下载文件夹 |
| 选目录 / 打开目录 / 下载记录 | 支持（Windows） | 关闭，接口直接返回 403，不做模拟 |
| Git 历史 | 可取消浅克隆以获取完整历史 | 不提供，只有默认分支快照（含准确提交 SHA） |
| 单次上限 | 100 个项目 | 10 个项目，合并后解压不超过 150 MB |
| 其他 | — | 同一来源每小时 30 次打包请求，同时只允许 1 个打包任务 |

云端模式不写服务器磁盘、不执行 Git、不运行下载到的代码，也不保留副本：源码在内存中合成后立即回传。会话令牌与同源校验照旧生效，跨站来源一律拒绝。`GET /api/upstreams` 可自检 github.com、api.github.com、codeload.github.com、raw.githubusercontent.com 的可达性与耗时，用来区分限流、域名不可达与本机网络问题。

本机模式不受影响：Windows 上 `npm start`（或双击 **start.cmd**）始终监听 `127.0.0.1`。Linux 容器里检测到 `PORT` 即按云端模式启动，避免平台忽略启动命令时误绑回环地址；需要显式指定时用 `PUBLIC_MODE=1` / `PUBLIC_MODE=0`。

## 使用

1. 切换日榜、周榜、月榜或累计总榜，可按语言筛选，并搜索当前页项目。
2. 勾选项目；跨榜单、分页和搜索保留选择，最多 100 个。
3. 在右侧填写绝对目录（例如 `F:\Projects`），或点文件夹按钮选择目录。
4. 选择 **Git 克隆**（默认浅克隆，可取消勾选下载完整历史）或 **源码 ZIP**（默认分支的固定提交快照，不含 `.git`）。
5. 点击下载，在下载记录查看进度、取消、重试、改用 ZIP 或打开已完成的目录。

保存位置为 `<指定目录>/<作者>/<仓库>`，同名目录自动跳过，不覆盖已有文件。任务先写入同目录下唯一的临时文件夹，成功后移动到最终位置。取消和失败会清理该任务的临时文件。

## 榜单口径与限制

- **日 / 周 / 月**：GitHub Trending 候选仓库，按该周期新增 Star 降序。Trending 不是全站完整增量榜；不能声称它包含所有 GitHub 仓库。页面展示新增数和累计数。
- **总榜**：GitHub Search API，公开、非 Fork 仓库按累计 Star 降序，每页 100 个，最多前 1,000 个。部分 GitHub 搜索可能返回不完整结果，界面会提示。搜索框仅过滤当前页，不进行全站关键词检索。
- **时间**：周期由 GitHub 提供，不代表本地自然日边界；页面时间统一显示北京时间。抓取结果缓存 10 分钟，支持主动刷新。
- **降级**：Trending 直连失败时使用 isboyjc 公开快照；显示来源及快照发布时间。超过 36 小时标记历史数据。刷新失败且本地有旧数据时，保留旧数据并提示。没有可靠数据时明确报错，不生成模拟榜单。
- **GitHub 额度**：匿名 Search 有限流。可将 `.env.example` 复制为 `.env` 并设置 `GITHUB_TOKEN` 后重启。Token 仅由后端访问 api.github.com，不存入浏览器。无需 Token 即可起步。
- **网络**：Git、Trending、GitHub API、codeload 的可达性可能不同；Git 失败可在记录中改用 ZIP。支持 HTTP_PROXY / HTTPS_PROXY / NO_PROXY，并自动读取 Windows 已启用的 HTTP/HTTPS 系统代理；不修改系统或 Git 全局配置，不内置第三方下载代理。显式 Git 代理优先；克隆时仅对该次 Git 命令覆盖全局 HTTPS→HTTP 地址改写，保持 GitHub HTTPS 连接。源码 ZIP 直接使用 codeload，不消耗 REST API 配额，并从 ZIP 注释记录准确提交 SHA。
- **下载内容**：不会执行下载的代码，不自动拉取 Git submodule 或 Git LFS 内容。ZIP 上限为压缩 120 MB、解压 600 MB、50,000 文件；遇到符号链接或本机不支持的路径时拒绝，建议改用 Git。
- **重启**：缓存、下载历史和默认目录保存在 `.data/`；运行中的任务在重启后标记中断，可手动重试。选择列表保存在浏览器 localStorage。历史保留最近 500 条；两项任务并发运行。

## 开源复用

已将 [huchenme/github-trending-api](https://github.com/huchenme/github-trending-api) 完整源码导入 `upstream/github-trending-api-master/`，实际改编其 Cheerio 抓取逻辑；MIT 许可保留。备用数据来自 [isboyjc/github-trending-api](https://github.com/isboyjc/github-trending-api)。详情见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

上游主要提供 API，不包含本机目录选择与批量克隆。因此本项目新增本地服务、中文 UI、队列及缓存。未采用整个上游旧服务运行环境，以避免引入过时依赖。

## 验证

```powershell
npm run check
npm test
# 可选：连接真实 GitHub，验证云端打包下载、本机接口关闭与限额拦截。
npm run smoke:cloud
# 可选：连接真实 GitHub，启动隔离的本机服务并验证真实榜单、Git 克隆和源码 ZIP。
npm run smoke
```

测试覆盖真实 HTML 样式解析、数字与仓库名校验、缓存降级与时间、官方总榜、下载队列并发、取消、重启、路径边界、防覆盖、ZIP 路径校验，以及云端打包的分层合并、提交标识、坏条目跳过与失败降级。网络不可用不影响离线测试。

## 大模型

当前抓取、排序和下载使用确定性代码，运行不需要大模型或模型费用。后续有需要时可加中文 README 摘要、用途分类或自然语言筛选；模型不会用于编造 Star 数据或决策本机命令。
