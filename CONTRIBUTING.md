# 参与贡献

感谢你对姜十三论坛的关注！这是一个开源项目，欢迎提交 Issue 和 Pull Request。

## 开发环境

**要求：** Go 1.26+、Node.js 18+（仅构建 `web_src` 静态资源）

本分支（`rebuild/gitea-ssr`）为 **Go 模板 SSR**；对照 React SPA 请 `git checkout main`。

```bat
REM Windows：请用 build.bat（内部 Bypass ExecutionPolicy）
build.bat -Target dev
REM 浏览器访问 http://localhost:3000
```

```bash
# Linux / macOS
make dev
```

## 提交规范

- 一个 PR 只做一件事，保持 diff 小而清晰
- 前端（`web_src` / 模板）改动请确认浅色 / 暗色主题下都正常
- 涉及 UI 变更时，建议在 PR 中附上截图
- 功能语义以 [`docs/rebuild-spec/`](docs/rebuild-spec/) 为准

## 完整构建

```bat
build.bat            REM Windows：先 web_src，再 go build → dist/
```

```bash
make build           # Linux / macOS
```

## 报告问题

在本仓库 Issues 中描述（也可参考 [docs/issue-templates.md](docs/issue-templates.md)）：
- 期望行为与实际行为
- 复现步骤、浏览器 / OS
- 相关模板或 `routers/web` 路径（若已知）
