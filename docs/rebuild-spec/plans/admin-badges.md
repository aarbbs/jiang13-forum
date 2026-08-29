# Admin 徽章管理（SSR）— 实现计划

> 状态：已完成（SSR `/admin/badges`）  
> 分支：`rebuild/gitea-ssr`

## 范围

| 能力 | 服务 | 路由 |
|------|------|------|
| 列表（含停用） | `BadgeService.ListDefs(true)` | `GET /admin/badges` |
| 创建/更新定义 | `UpsertDef` | `POST /admin/badges`、`POST /admin/badges/:id` |
| 删除定义 | `DeleteDef`（清 `user_badges`） | `POST /admin/badges/:id/delete` |
| 颁发限定 | `AwardLimited` | `POST /admin/badges/award` |
| 收回 | `Revoke` | `POST /admin/badges/revoke` |

## 不做

自动徽章规则引擎调度 UI（P2，服务层 `EvaluateAuto` 仍可被触发）、等级设定。

## 验证

`build.bat`；冒烟：创建限定徽章 → 颁发给用户 → 收回 → 删除。
