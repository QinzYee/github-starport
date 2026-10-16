# 免费公网发布与可选本地助手

公网版是纯静态文件，不需要常驻 Node 服务或购买服务器。网站通过同源 JSON 提供真实榜单，用户可不安装助手，直接获取源码 ZIP 链接、复制 Git 命令或下载项目清单。

当前实例：https://starport-github.github-hot-projects.workers.dev/ 。2026-10-16 已完成 GitHub Actions 到 Cloudflare 的实际发布验收；维护者电脑关机不影响网站访问和云端更新。定时工作流每小时触发，平台可能延迟调度。只有运行本地助手下载项目时，使用者自己的电脑需要开机。

## 第一次发布

1. 准备一个 GitHub 仓库。若使用公开仓库，标准 GitHub Actions 运行器可以免费使用；发布应用与公开源码是两件事，创建公开仓库前应确认你愿意公开代码。不要上传 `.env`、`.data`、`.workbuddy`、`*.genie`、`node_modules`、`dist` 或个人下载项目。
2. 注册并登录 Cloudflare 免费账号。在 Workers & Pages 中启用 Workers，按提示创建你的 `workers.dev` 子域名。无需购买自己的域名。
3. 在 GitHub 仓库 Settings → Secrets and variables → Actions 中添加：
   - Repository variable `CLOUDFLARE_ACCOUNT_ID`：Cloudflare Account ID。
   - Repository secret `CLOUDFLARE_API_TOKEN`：仅授予该账号所需的 Workers 部署权限。在 Cloudflare 账号中创建 Token 后直接填进 GitHub Secret，不发送给聊天，不写进源码。
4. 将本项目代码提交到仓库 `main` 分支。仓库 Actions 中启用工作流，手动运行 **Publish public portal**。
5. 工作流检查代码、定时采集榜单、构建 Windows 助手及 `dist`，然后部署到 Cloudflare。部署日志会显示真实的 `https://starport-github.<你的子域>.workers.dev` 地址；域名以实际返回为准。

`wrangler.jsonc` 的 `name` 可以改成你的应用名。尚未配置 Cloudflare Account ID 时，工作流只生成可检查的 `starport-publication` 附件，不会假装完成部署。

## 本地预览发布包

```powershell
npm ci --ignore-scripts
npm run data:update
npm run build:helper
npm run build:portal
npm run preview:portal
```

打开 http://127.0.0.1:4318 。该预览只提供 `dist` 静态文件，不提供 `/api/archive` 等服务器接口；这能验证网页是否真正可以独立托管。

已登录 Cloudflare 时，也可运行 `npx wrangler login` 完成浏览器授权，再运行 `npm run deploy:portal` 发布当前 `dist`。不能用本地登录代替 GitHub 定时发布所需的 Secret。

## 自动更新与范围

- `.github/workflows/publish.yml` 在推送 `main`、手动触发和每小时第 17 分钟运行。平台的定时任务可能延迟，不保证精确整点执行。
- 抓取全部语言和界面中列出的语言的日、周、月 Trending。全部语言累计总榜最多 1,000 个；单语言累计榜发布前 100 个，页面显示真实范围。
- 数据保留真实来源与数据时间。抓取失败保留上次快照；缺失基础榜单时阻止首次发布。静态页面的“刷新”读取最近发布数据，不触发后台现场抓取。
- GitHub Actions 用自动提供的 `github.token` 访问官方 API；Token 只存在采集进程中，绝不进入网页包。访问者读静态文件不会消耗 GitHub API 配额。
- 不在云端重新打包用户选中的项目；点击源码列表的各项，由浏览器向 GitHub 下载原始 ZIP。浏览器对多文件自动下载的限制不会被绕过，网页不会把打开下载链接伪报为下载完成。

## 可选 Windows 助手

下载 `starport-helper-windows.zip`，完整解压到固定目录，双击 `install-helper.cmd`。安装程序从 Node.js 官网下载固定版本并验证官方 SHA-256，安装到助手自己的 `runtime` 文件夹；应用依赖已包含，注册协议仅作用于当前用户，不需要管理员权限。Git 克隆仍需电脑安装 Git；没有 Git 可下载 ZIP。

网站上的“交给本地助手”使用 `starport://import?...` 唤醒助手。浏览器可能要求用户确认。助手只导入仓库名称，打开本地页面；**不自动开始下载**。用户核对仓库、填写或选择目录后，再点击下载。网页不能指定用户磁盘路径、传命令或让助手执行仓库代码。

无法唤醒时，在网站下载 `projects.starport.json`，启动助手 `start.cmd`，使用“导入网站项目清单”。运行 `uninstall-helper.cmd` 移除协议关联；卸载不会删除已下载的项目。助手目录移动后需要重新安装关联。

## 免费额度与发布边界

这套实现只向 Cloudflare 上传静态资源，标准助手包不含体积较大的 Node 二进制，因此满足静态托管单文件大小限制。安装运行时的流量来自 Node.js 官网。请保持免费计划，按各平台当前条款使用；不承诺所有第三方服务永远免费或任何地区的网络都能访问。

在账号连接和平台返回部署成功之前，`dist` 是可发布包，不能宣称已经有可用公网地址。
