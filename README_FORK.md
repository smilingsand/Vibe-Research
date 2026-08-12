# Vibe-Research — Chris Fork

## 关于此 Fork

这是 [simonlin1212/Vibe-Research](https://github.com/simonlin1212/Vibe-Research) 的个人 Fork。原项目由 Simon Lin 维护。

本 Fork 汇集了在实际安装、运行和日常使用中完成的修复、增强与实验性功能。它不是官方 Vibe-Research release；上游的功能范围、兼容性承诺和发布说明仍以原项目为准。

## 相对 Upstream 的主要差异

- **海外证券**：个股数据、自选股与持仓支持 A 股 `300760`、美股 `AAPL.US`、港股 `00700.HK` 和韩股 `005930.KR`。港股短代码会补零；公告和个股新闻仍仅支持 A 股。
- **个股数据缓存**：后端为多个只读股票数据端点提供进程内 TTL/LRU 缓存，以减少重复远程请求；缓存不落盘，后端重启后清空。
- **资讯雷达**：可保存 AI 生成的赛道要点和非中文标题的简体中文译文；刷新使用快照标识防止旧 AI 结果覆盖新 RSS 数据，并按规范化标题去重。
- **持仓账本**：以购买和清仓交易驱动当前持仓，保留交易历史与已实现盈亏快照；支持多市场标的，并按原生币种分别汇总，不进行汇率换算。
- **后端配置**：`backend/backend_config.json` 集中维护 A 股/全球指数及研报文件名分类关键词；修改后需重启后端，配置格式错误会阻止后端启动。
- **界面与操作调整**：持仓页包含筛选、排序、可折叠历史与加载提示；板块中心显示建设状态，侧栏子板块可折叠。

这些差异中包含实验性设计，未必适合直接贡献回上游。详细历史见 Changelog。

## 分支

- `main`：尽量保持与 upstream 对齐。
- `chris-changes`：此 Fork 当前维护和使用的版本。

## 安装与使用

通用安装、启动和使用说明请以 [README.md](README.md) 为准。本 Fork 的额外注意事项：

- 海外证券请使用上述带国家后缀的格式；裸代码和旧的 `.KS` 后缀不受支持。
- 编辑 `backend/backend_config.json` 后必须重启后端。
- 持仓和研报等用户数据默认保存到用户目录；不要将本地数据文件提交到 Git。

## 变更历史

完整历史请见 [CHANGELOG_chris.md](CHANGELOG_chris.md)。

## Upstream 与许可证

本 Fork 基于 [simonlin1212/Vibe-Research](https://github.com/simonlin1212/Vibe-Research)。保留原项目的 MIT License、版权和 attribution；详情见 [LICENSE](LICENSE)。本 Fork 不修改原许可证。
