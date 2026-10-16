# 验证记录

验证日期：2026-10-15，北京时间。

## 公网静态版与可选助手（后续改造）

- 当前 `npm test` 共 35 项通过，保留原有功能测试并新增清单/协议输入校验、静态数据索引、失败快照保留、缺失基础数据阻止发布、语言可用性和发布目录隔离测试。
- 浏览器使用仅提供 `dist` 文件的独立静态服务验证：真实榜单、累计榜第 2 页、Python 筛选、原始 ZIP 链接、JSON 清单导出，以及本地助手导入相同的 2 个项目；导入后下载任务数为 0。
- 无当前快照的语言被禁用；从该语言切换到缺失的周期时回到全部语言。静态累计榜目前实际发布 500 项，界面明确显示当前覆盖数与 1,000 目标上限；部分语言累计快照受匿名 Search 配额限制，等待已授权的工作流补齐。
- `node scripts/check-helper.mjs`：解压最终助手包后可仅用包内生产依赖启动服务，协议清单往返正确，没有自动下载；测试没有注册本机协议关联。
- 助手包约 3 MB，检查未含 .env、.data、Wrangler 等开发工具。Node.js 冷安装程序进行了 PowerShell 语法解析；本次未执行用户级注册或冷安装下载。
- `npx wrangler deploy --dry-run` 成功，不代表已经发布。实际 Cloudflare 账号授权、GitHub Actions 在目标仓库的首次运行及真实公网 URL 仍需用户提供账号/仓库后完成。
- 参考截图：`.impeccable/review/portal-desktop.png`、`portal-mobile.png`、`portal-mobile-panel.png`、`helper-import.png`。

## 自动检查

- `npm run check`：后端和浏览器脚本语法检查通过。
- `npm test`：17 项测试通过，无跳过。加入云端打包与断开检测后共 27 项通过（`test/archive.test.js`、`test/request.test.js`）。
- `npm audit --omit=dev`：0 项已知依赖漏洞。

## 云端模式（公网）验证

发布日期：2026-10-15，地址 https://github-hot-projects.app.workbuddy.host/ ，入口 `server/cloud.js`，运行环境 Node v22.13.1。

对已发布地址执行的真实网络验收（脚本临时创建于仓库根，验收后删除）：

- `GET /api/config`：`publicMode` 为真；不返回服务端目录、下载方式、浅克隆等本机设置；下发 64 位会话令牌。
- `GET /api/rankings?period=daily`：12 个真实 Trending 项目；`period=all`：100 个真实 GitHub Search 结果。
- `GET /api/upstreams`：github.com、api.github.com、codeload.github.com 可达（2480 / 440 / 589 ms）；raw.githubusercontent.com 首次探测 8 秒超时、复测可达，属偶发。
- `POST /api/archive`（`octocat/Hello-World`、`octocat/Spoon-Knife`）：3.3 秒返回 1 KB ZIP；两个仓库的提交标识与 GitHub ZIP 注释一致（`7fd1a60…`、`d0dd1f6…`）；条目按「作者 / 仓库」分层、无逃逸路径，`octocat/Hello-World/README` 内容为 `Hello World!`。
- 拦截：缺少会话令牌 403；跨站 Origin 403；`/api/directory/pick` 403；`POST /api/downloads` 403；11 个仓库 400。
- 打包链路另在同一份代码上本地验证：两个仓库合并 1.3 秒、4 个条目。

未验证与受限的部分：浏览器内的实际点击下载流程未通过 UI 自动化确认；本机 `npm start`、`npm run smoke`、`npm run smoke:cloud` 无法在当前环境执行（沙箱把 `reg.exe` 列入黑名单，而服务启动会读取 Windows 系统代理），云端结论来自对公网地址的验收请求，不来自本地启动的服务。

## 发布过程中修复的两个缺陷

- `undici@8` 在 Node 22.13 上启动即崩（需要 Node 22.15+ 的 zstd 接口）→ 降到 `undici@^7`，`engines` 放宽为 `>=22.12.0`。
- 打包接口用 `req.on('close')` 判断客户端断开，而 Node 16 起请求体读完即触发该事件，导致任务被自我取消、且因「已取消」不回响应，用户只看到 60 秒网关 504 → 改用 `res.on('close')` 并判断 `res.writableEnded`（`server/request.js`），附回归测试。

## 浏览器检查

使用真实本地服务和真实 GitHub 数据检查：

- 日榜、周榜、月榜与累计总榜均可显示真实结果；按增长数或累计数排序。
- 切换日榜到周榜后保留已选项目。
- 总榜获取每页 100 个，下一页的首项排名为 101。
- 按 Python 筛选后当前结果均为 Python；当前页关键词过滤可用。
- 批量提交表单的请求包含勾选项目、指定目录、下载方式和浅克隆选项；提交成功清空已提交项目。此表单请求验证通过浏览器拦截响应完成，没有下载大型榜单项目。
- 1440×1000 桌面、390×844 移动宽度无横向溢出；无浏览器 JavaScript 异常。
- 截图：`.impeccable/review/desktop.png`、`mobile.png`、`mobile-panel.png`。

## 真实下载与文件验证

`node scripts/smoke.mjs --downloads-only` 最终通过。脚本启动隔离本地服务，使用临时目录，不修改主应用的历史和下载目录。

- `octocat/Hello-World` 与 `octocat/git-consortium` 并发 Git 克隆成功，检查了 `.git/HEAD` 和文件内容。
- `octocat/Spoon-Knife` ZIP 源码下载、解压成功，检查了 README.md；从 GitHub ZIP 注释验证了提交 `d0dd1f61b33d64e29d8bc1372a94ef6a2fee76a9`。
- 重复下载已有目录时跳过。
- 不携带本地会话令牌的写请求被拒绝；跨站来源的请求被拒绝。
- 测试结束移除了脚本创建的临时目录。

四种真实榜单已在早前完整 smoke 阶段通过。后续重复完整验证遇到 GitHub Search 匿名限流，因而最终一轮只重复下载相关检查；不将被限流的完整 smoke 描述为通过。

## 环境与限制

- 本机 GitHub 直连和 TLS 偶有中断。已适配 Windows 现有系统代理并为暂态 Git 网络错误自动重试一次；不修改用户全局配置。
- 匿名 GitHub Search / REST 仍可能限流；页面提供提示和 Token 配置说明。
- Windows 原生目录选择窗口未通过 UI 自动化验证；后端提供 FolderBrowserDialog，用户也可以直接填写绝对目录。
- 移动端为浏览器视口检查，未在物理移动设备上运行。本工具实际文件操作发生于运行本地服务的电脑。
- UI 设计检测器缺少可选解析模块，以降级模式运行；其字体警告已修复。独立界面与源码复核完成，指出的四项小字对比度问题已全部修复；复核员在限定这四项的复验中评为 resolved / ship。复验不替代独立运行功能测试。
