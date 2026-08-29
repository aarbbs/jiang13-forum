# P2 等级设定与徽章展示 — 实现计划

> 状态：已完成  
> 分支：`rebuild/gitea-ssr`

## 范围

| 能力 | 实现 |
|------|------|
| Admin 设等级 | `POST /admin/users/:id/level` → `SetUserLevel`（Exp 调至门槛） |
| 公开等级 | 既有 `/user/:id`、`/profile` Lv/Exp |
| 徽章展示 | 用户页 / 资料页列表；访问时 `EvaluateAuto` |
| 防刷分成 | 确认 `suspiciousUnlockPair` 已落地并勾选 `02` |

## 验证

`build.bat`；冒烟：设用户 Lv5 → Exp=200；用户页可见等级。
