# 第三方来源与复用说明

## huchenme/github-trending-api

- 原项目：https://github.com/huchenme/github-trending-api
- 许可：MIT，Copyright (c) 2019 Hu Chen。
- 上游完整源码：`upstream/github-trending-api-master/`，由 GitHub master 分支源码 ZIP 导入；保留原始 LICENSE、README 和实现。归档注释验证的提交为 `c23aab9a0a55e3528459a73d8eb55194171bc2de`，导入信息与抓取源文件 SHA-256 见 `upstream/SOURCE.json`。
- 实际改编代码：`server/github.js` 的 `parseTrending`。沿用上游 Cheerio 解析流程与字段选择方式，适配当前页面标签、数字解析、字段标准化。
- 没有安装或执行上游旧版依赖及安装钩子；本项目采用当前独立依赖锁文件。

上游 MIT 许可全文见 `upstream/github-trending-api-master/LICENSE`，必须随再分发保留。

## isboyjc/github-trending-api

- 数据来源：https://github.com/isboyjc/github-trending-api
- 项目声明 MIT 许可。
- 当 GitHub Trending 直连失败时，通过 GitHub Contents API 读取该项目公开 JSON 快照，并使用 `pubDate` 标记数据日期。
- 未复制其实现代码。快照可能陈旧；界面明确标记历史数据，不将获取时间充作榜单时间。

## 应用依赖

express、cheerio、adm-zip、undici 及其传递依赖的许可随各 npm 包保留在 node_modules 中。版本固定于 package-lock.json。
