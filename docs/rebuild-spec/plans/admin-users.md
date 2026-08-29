# Admin 用户管理（SSR）— 实现计划

> 状态：待执行（指针见 [09-ssr-progress.md](../docs/rebuild-spec/09-ssr-progress.md)）  
> 分支：`rebuild/gitea-ssr`

## 范围

在 Admin 增加用户列表与运营操作，复用已有服务层，不恢复浏览器管理 JSON `/api`。

| 能力 | 服务 | 路由 |
|------|------|------|
| 列表/搜索/分页 | `UserService.ListUsers` | `GET /admin/users` |
| 禁言/解禁 | `UserService.BanUser` | `POST /admin/users/:id/ban` |
| 认证开关 | `SetVerified` | `POST /admin/users/:id/verify` |
| 调积分 | `PointsService.AdminAdjust` | `POST /admin/users/:id/points` |

## 实现要点

1. [`routers/web/home.go`](../routers/web/home.go) admin 组注册上述路由  
2. 新建 [`routers/web/admin_users.go`](../routers/web/admin_users.go)：渲染 + CSRF POST + PRG  
3. [`templates/admin/users.tmpl`](../templates/admin/users.tmpl) + [`templates/admin/nav.tmpl`](../templates/admin/nav.tmpl) 入口  
4. 回写 `02` §H（调积分/认证相关）、`06` `/admin/users` 已迁；更新 `09` 当前指针 → badges  

## 不做

等级设定 UI、徽章授予、批量导入、恢复 `/api/admin/users` 作 UI。

## 验证

`build.bat`；冒烟：搜索用户 → 禁言 → 调积分 → 切换 verified。
