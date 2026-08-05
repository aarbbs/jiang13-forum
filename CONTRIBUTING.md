# 参与贡献

感谢你对姜十三论坛的关注！这是一个开源项目，欢迎提交 Issue 和 Pull Request。

## 开发环境

**要求：** Go 1.26+、Node.js 18+

```bat
REM Windows：一键启动后端 + 前端热更新（请用 build.bat）
build.bat -Target dev
REM 浏览器访问 http://localhost:5173
```

```bash
# Linux / macOS
make dev
```

## 提交规范

- 一个 PR 只做一件事，保持 diff 小而清晰
- 前端改动请确认浅色 / 暗色主题下都正常
- 涉及 UI 变更时，建议在 PR 中附上截图

## 完整构建

发布单二进制前需先构建前端并 embed：

```bat
build.bat            REM Windows
```

```bash
make build           # Linux / macOS
```

## 报告问题

在本仓库 Issues 中描述（也可参考 [docs/issue-templates.md](docs/issue-templates.md)）：

1. 复现步骤
2. 期望行为 vs 实际行为
3. 环境信息（系统、浏览器、Go/Node 版本）
4. 截图或日志（如有）

演示站：[https://bbs.iioio.com/](https://bbs.iioio.com/)  
已知问题与计划功能见 [ROADMAP.md](ROADMAP.md)。

## 行为准则

请保持友善、尊重他人。骚扰、歧视或恶意行为不被容忍。
