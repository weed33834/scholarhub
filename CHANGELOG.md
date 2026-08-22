# Changelog

本文件记录 ScholarHUB 的可见变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

- 登录深链保持：新增 `auth-guard.ts` 统一守卫(requireAuth / requireAdmin),
  19 个受保护路由跳转登录页时携带原始目标地址,登录(含两步验证完成)后
  回到出发页而非一律落在仪表盘;仅接受站内绝对路径。
- 生产环境强制双提交 CSRF：前端 api 客户端对非幂等请求回显 `X-CSRF-Token`
  (中间件关闭时无副作用);后端 `csrf_enforced` 在 production 恒为开启,
  开发/测试保持可选。启动时对未开启 admin 强制 2FA、注册验证码的生产部署
  输出一次性安全态势告警。

### Changed

- 引用导出的 BibTeX / RIS 序列化改用 ingest 侧同款库(bibtexparser /
  rispy),消除「导入用库、导出手写」的双实现漂移;引用键生成、类型映射
  与字段顺序不变,22 个导出相关测试零改动通过。

### Fixed

- 修复通知列表同一时间戳下排序不确定的问题(决胜键 id 改为倒序),
  根治 `test_list_returns_user_notifications` 偶发失败。
- 可访问性：Loading 占位补充 `role="status"` + `aria-live="polite"`;
  桌面侧边栏激活项补齐 `aria-current="page"`(与移动端外壳一致)。

### Removed

- 移除依赖冗余：`@testing-library/dom` 移至 devDependencies;删除无人
  引用的独立包 `@radix-ui/react-slot`(组件统一经 `radix-ui` 元包导入);
  修正 package.json 遗留的 MIT 许可证字段为 Apache-2.0。

### Added

- 新增移动端独立专用外壳(`MobileAppShell`):底部 4 Tab + 中心 FAB + "我的"底部抽屉,
  运行时按视口宽度切换,与桌面侧边栏完全独立,非响应式裁剪。
- 目录浏览、仪表盘、详情页、阅读页四个区域做了移动专属设计与适配:
  卡片流(非表格)、2 列大块+快捷操作、固定底部操作栏。
- 新增 Playwright `mobile` 项目(iPhone 13 视口)与 `mobile-shell.spec.ts` 5 个 E2E 用例。
- E2E 测试套件更新至 57 个 spec(56 chromium + 5 mobile,含 4 个共用 mobile/chromium 的用例)。
- 新增 `npm run test:e2e` 脚本,便于新贡献者发现和执行 Playwright 测试。
- 新增 `VERSION` 文件,声明项目版本 0.1.0。
- 新增 `.github/workflows/ci.yml`:PR/push 自动跑 lint、typecheck、单元测试、后端 pytest。
- 新增 `.vscode/extensions.json`:推荐项目开发所需 VS Code 扩展。
- 新增 GitHub 镜像仓库 `weed33834/scholarhub`,与 GitCode 主仓同步发布。
- 新增项目 LOGO、投稿-审稿-发表流程图、系统架构图(均位于 `docs/assets/`)。
- 新增 `CHANGELOG.md`、`CODE_OF_CONDUCT.md`、`SUPPORT.md`,补齐开源治理配套。
- 新增 CI `rls` job:以 PostgreSQL 17 service 容器运行 `tests/test_rls_isolation.py`,
  使「双层租户隔离」安全特性首次进入 CI 门禁(此前该测试在 SQLite 下整模块跳过,零覆盖)。

### Fixed

- 修复前端投稿/审稿列表 queryKey 缺少分页参数的问题:`useMySubmissions`、
  `useAllSubmissions`、`usePendingSubmissions`、`useMyReviewAssignments` 的缓存 key
  未包含 `page/pageSize`,staleTime 内翻页会命中旧页缓存显示错误数据。
- 修复审稿工作流审计日志非原子写入的问题:`review_submission`、`assign_reviewer`、
  `cancel_assignment`、`editor_decision` 四处先 commit 业务状态、再单独 commit
  AuditLog,中途失败会产生「有决定无审计记录」;现改为与业务变更同一事务提交。
- 修复依赖升级后累积的 39 处 mypy strict 错误(token_denylist/tenant/webauthn/
  blinding/doi/search 等),恢复 `mypy app` 门禁为绿;同时清理存量 ruff 违例
  (alembic 文件缺尾换行等)。
- 修复 Node >= 24 残缺内置 Web Storage 遮蔽 jsdom 实现,导致
  `cookie-banner.test.tsx` 5 个用例抛 `localStorage.clear is not a function`
  的问题(tests/setup.ts 注入规范兼容的内存实现)。
- 修复三语 README 与实际不符的问题:License 徽章/页脚 MIT → Apache-2.0(与 LICENSE
  一致)、移除指向不存在的 `scan_secrets.py` 的引用(改为 gitleaks 命令)、模块表补上
  已发布的 `doi` 模块、roadmap 勾选已完成的 DOI 注册、E2E/单测徽章数字校准为实测值。

### Removed

- 移除死代码 TOTP 2FA 链路:后端 `/api/auth/2fa/*` 路由(two_factor.py,引用模型上
  不存在的列,调用即 500)、手写 RFC 6238 实现(core/totp.py)及其算法测试;前端
  `use-two-factor.ts` hooks、仅被孤儿路由 `/settings` 引用的 `TwoFactorSection`,
  以及无导航入口、无鉴权守卫的孤儿路由 `/settings` 本身。线上唯一 2FA 流程为
  `/users/me/2fa/*` + `/auth/login/2fa`(登录页与账户安全页均使用该链路)。

- 修复 `vite.config.ts` vitest 配置未排除 `tests/e2e/` 目录,导致 `vitest run`
  误将 Playwright spec 当作 vitest 用例执行(10 条虚假失败)。
- 修复 `admin-user-management.spec.ts` 禁用账号后重新打开下拉菜单时的 Radix
  内部状态残留问题:缺少 Escape 确认关闭步骤,导致 trigger 二次点击行为异常
  (实测导航至 `/verify-email` 页面)。对齐同文件通过用例的稳健写法。
- 修复 `reader/$resourceId` 在新用户首次打开阅读页时进度无法上报的问题:`hasSyncedRef`
  改用 `progress.isFetched` 判断 query 完成;手动"保存进度"按钮绕过 guard,确保在
  GET /progress 仍在 retry 时也能立即上报用户输入。
- 修复 axios 数组参数序列化与 FastAPI `list[int] = Query()` 不匹配导致的引用导出 400。
- 修复 E2E 后端在 test 模式下 bootstrap 跳过导致 admin 账户未创建的问题。
- 修复 E2E 顺序运行触发 `/api/auth/login` 限流(10/min)导致后续测试全部 429。
- 修复 SQLAlchemy 2 async + aiosqlite 在 `commit` 阶段抛 IntegrityError 被包成
  `greenlet_spawn` 错误,导致 `except IntegrityError` 不触发的问题(改用 `flush`)。
- 修复 `db.rollback()` 后 ORM 属性 expire,在 async 上下文访问会触发同步 lazy-load 的问题
  (改用局部变量缓存 `user_id`/`tenant_id`)。
- 修复 React StrictMode 双挂载时初始 state 覆盖服务端真实进度的问题。
- 修复 `AnyHttpUrl` 类型在 SQLite DBAPI 上无法绑定的问题(统一 `str()` 转换)。
- 修复 DialogContent 长表单溢出 viewport 的问题。
- 修复 TanStack Router Devtools 浮层拦截 E2E 点击的问题(E2E 时通过 `navigator.webdriver` 隐藏)。
- 修复 Radix DropdownMenuCheckboxItem 残留 menu 导致后续点击被 portal 拦截的问题。
- 修复 Playwright strict mode 误匹配(用 `{ exact: true }`、`getByRole('heading')`、
  `aria-label` 等精确选择器替代 `getByText`)。
- 修复 Blob URL `<a download>.click()` 在 Playwright 中 `waitForEvent('download')` 不可靠
  的问题(改用 `waitForResponse` 监听 backend 响应)。

## [0.1.0] - 2026-07

### Added

- **core** 模块:租户、用户、角色、模块注册表、admin shell、部署脚本。
- **catalog** 模块:文章元数据、学科、作者、期刊、卷期、tag。
- **submission** 模块:投稿 → 编辑分配 → 审稿 → 录用/拒稿主流程。
- **review** 模块:OJS 风格审稿工作流、审稿意见、审稿人角色管理。
- **reader** 模块:浏览器内 PDF 阅读、阅读进度、跨设备同步、阅读历史。
- **export** 模块:BibTeX / RIS / CSV / JSON 引用导出,支持往返。
- **library** 模块:用户自策展的阅读列表。
- **follows** 模块:作者 / 学科订阅 + 通知 fan-out。
- **notifications** 模块:站内通知流,按用户隔离。
- **ingest** 模块:BibTeX/RIS/CSV 批量导入 + Crossref/arXiv 元数据抓取。
- **recommendations** 模块:基于阅读历史的个性化推荐 + 推荐理由。
- 双层租户隔离:应用层 filter + PostgreSQL Row Level Security。
- JWT 鉴权:access token (短时, sessionStorage) + refresh token (httpOnly cookie)
  + token_version 双轮换。
- 邮件后端可插拔:console (dev) / SMTP relay (Mailgun / SendGrid / SES / Postmark)。
- OIDC SSO:Google / GitHub / Generic / Keycloak。
- Docker Compose dev + prod 部署,Caddy 自动 TLS,Alembic 迁移在容器启动时执行。
- CI:GitHub Actions 跑 ruff + mypy + pytest + RLS Postgres + 前端 lint/typecheck/build/test。
- gitleaks 密钥扫描 CI。
- 安全中间件:CSP、HSTS、X-Frame-Options、X-Content-Type、Referrer-Policy、Permissions-Policy。
- 防御性 secret 校验:非 test 环境强制拒绝弱密钥/弱密码。
- 审计日志:每个 admin 操作按租户记录。

[Unreleased]: https://github.com/weed33834/scholarhub/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/weed33834/scholarhub/releases/tag/v0.1.0
