# Changelog

本文件记录 ScholarHUB 的可见变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

> 版本阶梯说明(2026-08 回溯整理):`0.0.x` 为平台奠基期的主题切片;`0.1.0`
> 为首个公开整理版本;此后按 SemVer 常规演进——功能聚合进 minor(`0.x.0`),
> 修复收进 patch(`0.1.x`)。0.0.x 各节内容回溯自提交历史,日期取当期区间。

## [Unreleased]

#### 计划中的 0.2.0(架构与国际化):后端 submission 模块 service 层拆分、前端 API hooks 按域拆分、MSW hook 测试、i18n 基础设施。

## [0.1.3] — 2026-08-22

### Added

- 管理端用户搜索改为服务端实现:`GET /admin/users?q=` 对 username/email
  做全表大小写不敏感子串匹配(LIKE 通配符按字面量转义);前端 300ms 防抖
  接入,queryKey 携带 q 防止跨词缓存串页。
- CI 增加 mobile 视口 E2E 项目(iPhone 13 / MobileAppShell 用例),与
  chromium 并行门禁;main 分支启用分支保护,backend / frontend / rls /
  e2e 四项检查全部通过方可合并。
- 稿件上传内容嗅探(新增 `app/core/filescan.py`):PDF / ZIP(DOCX) /
  OLE2(DOC) / PostScript / 纯文本魔数校验,声明 MIME 与真实内容不符时
  返回 415,杜绝伪装上传;零第三方依赖。

### Changed

- 上传链路内存占用有界化:请求体经 SpooledTemporaryFile(8MB 内存阈值,
  超出落盘)流式写入存储,LocalStorage 在工作线程分块拷贝,S3 直接透传;
  本地后端下载改用 FileResponse 真·流式(支持 Range/ETag),不再整文件
  读入内存。
- 阅读页时长统计重构:每秒 setState 引发的整页重渲染(60 次/分钟)改为
  ref 累加 + 15s 粗粒度同步展示(4 次/分钟);新增 pagehide keepalive
  上报与切后台即时 flush,关标签页最多丢失的阅读时长从 29s 降至 ~0。
- API 客户端测试重写:mock axios 的同义反复断言替换为真实实例 + 可编程
  adapter 的行为测试,覆盖 401 单飞刷新、并发共享、刷新失败登出、防循环
  与 CSRF 头注入等此前零覆盖的关键路径。

### Fixed

- 修复通知列表同一时间戳下排序不确定的问题(决胜键 id 改为倒序)。
- 修复管理端搜索切换时整表闪 Loading 导致行内下拉菜单卸载重建、E2E
  菜单项持续 "not stable" 的问题(useAdminUsers 加 placeholderData)。

## [0.1.2] — 2026-08-22

### Added

- 登录深链保持:新增 `auth-guard.ts` 统一守卫(requireAuth / requireAdmin),
  19 个受保护路由跳转登录页时携带原始目标地址,登录(含两步验证完成)后
  回到出发页而非一律落在仪表盘;仅接受站内绝对路径。
- 生产环境强制双提交 CSRF:前端 api 客户端对非幂等请求回显 `X-CSRF-Token`;
  后端 `csrf_enforced` 在 production 恒为开启,开发/测试保持可选,并输出
  启动安全态势告警。

### Changed

- 引用导出的 BibTeX / RIS 序列化改用 ingest 侧同款库(bibtexparser /
  rispy),消除「导入用库、导出手写」的双实现漂移;22 个导出相关测试
  零改动通过。
- 可访问性:Loading 占位补充 `role="status"` + `aria-live="polite"`;
  桌面侧边栏激活项补齐 `aria-current="page"`。

### Removed

- 依赖冗余清理:`@testing-library/dom` 移至 devDependencies;删除无人
  引用的独立包 `@radix-ui/react-slot`;修正 package.json 遗留的 MIT
  许可证字段为 Apache-2.0。

## [0.1.1] — 2026-08-22

### Added

- 新增 CI `rls` job:以 PostgreSQL 17 service 容器运行 RLS 隔离测试,
  「双层租户隔离」安全特性首次进入 CI 门禁(此前在 SQLite 下整模块跳过,
  零覆盖);重新启用被误关的仓库 GitHub Actions。

### Fixed

- 修复前端投稿/审稿列表 queryKey 缺少分页参数导致的缓存串页
  (useMySubmissions / useAllSubmissions / usePendingSubmissions /
  useMyReviewAssignments)。
- 修复审稿工作流审计日志非原子写入:review / assign_reviewer /
  cancel_assignment / editor_decision 四处的 AuditLog 与业务变更改为
  同一事务提交。
- 修复依赖升级后累积的 39 处 mypy strict 错误与存量 ruff 违例,
  恢复 lint/type 门禁为绿。
- 修复 Node >= 24 残缺内置 Web Storage 遮蔽 jsdom 实现导致的 5 个
  单测失败(tests/setup.ts 注入规范兼容内存实现)。
- 文档与现实对齐:License MIT → Apache-2.0(三语 README)、移除不存在的
  `scan_secrets.py` 引用、模块表补上 `doi`、徽章数字校准。

### Removed

- 移除死代码 TOTP 2FA 栈:`/api/auth/2fa/*` 路由(引用模型上不存在的列,
  调用即 500)、手写 RFC 6238 实现(core/totp.py)、前端 use-two-factor
  hooks 与孤儿路由 `/settings`;线上唯一 2FA 流程为 `/users/me/2fa/*` +
  `/auth/login/2fa`。

## [0.1.0] — 2026-08

首个公开整理版本。平台全景:

- 十大域模块上线:**core**(租户/用户/角色/模块注册表/admin shell)、
  **catalog**(元数据/学科/卷期/tag)、**submission**(投稿主流程)、
  **review**(OJS 风格审稿)、**reader**(PDF 阅读/进度同步)、**export**
  (BibTeX/RIS/CSV/JSON 往返导出)、**library**(阅读列表)、**follows**
  (订阅+通知 fan-out)、**notifications**(站内通知)、**ingest**
  (批量导入 + Crossref/arXiv 抓取);另有 **doi**(DataCite 注册)。
- 双层租户隔离:应用层 filter + PostgreSQL Row Level Security。
- JWT 双 token 轮换(access 短时 + httpOnly refresh)、TOTP 两步验证、
  WebAuthn/passkeys、OIDC SSO(PKCE 强制)、GDPR 导出/软删/恢复。
- 安全中间件:CSP/HSTS/XFO/XCTO/Referrer/Permissions-Policy;
  弱密钥启动即拒;审计日志按租户落库;滑动窗口限流(内存/Redis 可切)。
- 部署:Docker Compose dev + prod,Caddy 自动 TLS,Alembic 启动迁移。
- 工具链:uv + ruff + mypy(strict)+ pytest + Vitest + Playwright;
  gitleaks / CodeQL / pip-audit 进 CI。
- 移动端独立外壳 MobileAppShell(底部 Tab + FAB + 抽屉),目录/仪表盘/
  详情/阅读四区域移动适配;Playwright mobile 项目(iPhone 13 视口)。
- 开源配套:Apache-2.0 LICENSE、CONTRIBUTING / COC / SUPPORT /
  SECURITY、CHANGELOG、三语 README、LOGO 与架构图、GitHub 镜像仓。

## [0.0.4] — 2026-08

测试体系打磨(E2E 56 specs 落地期间的专项修复):

- vite vitest 配置显式排除 `tests/e2e/`,终结 Playwright spec 被误跑
  的 10 条虚假失败;新增 `npm run test:e2e` 脚本。
- E2E 基建:test 模式 bootstrap 保证 admin 账户创建;顺序运行触发的
  登录限流 429 放宽;Radix DropdownMenuCheckboxItem 残留菜单、Devtools
  浮层遮挡点击、strict mode 误匹配(精确选择器)、Blob 下载监听等
  一批用例稳健性修复。
- 功能修复:reader 新用户首开进度无法上报(hasSyncedRef 改判 isFetched);
  StrictMode 双挂载覆盖服务端进度;axios 数组序列化与 FastAPI 不匹配的
  导出 400;SQLAlchemy async commit 阶段 IntegrityError 被 greenlet
  包装导致 409 失效(改 flush);rollback 后属性 expire 触发同步
  lazy-load;AnyHttpUrl 在 SQLite 绑定失败;DialogContent 长表单溢出。

## [0.0.3] — 2026-07

安全层成型:

- TOTP 两步验证(setup/verify/status/authenticate/disable/备份码)与
  WebAuthn 注册/认证;JWT 密钥在线轮换链;refresh token denylist。
- GDPR:个人数据导出、账号软删(30 天反悔)、PII 匿名化。
- OIDC SSO:Google / GitHub / Generic / Keycloak,PKCE 强制,state 用
  短时 JWT 防 CSRF;providers 发现端点供 SPA 动态渲染按钮。
- 限流:滑动窗口 per IP+route,Memory/Redis 存储可插拔,Redis 故障
  fail-open;CAPTCHA 钩子位预留。
- 安全响应头全套 + 双提交 CSRF 中间件(默认关,RFC 7807 错误格式,
  审计日志,弱 secret 启动校验)。

## [0.0.2] — 2026-07

域模块矩阵落地(详见 0.1.0 全景):catalog → submission/review →
reader/export/library/follows/notifications/ingest/doi/recommendations,
每模块自带 routes/models/schemas/tests 与 Alembic 迁移,经模块注册表
按依赖序装配。

## [0.0.1] — 2026-07

基础脊柱:FastAPI + SQLAlchemy 2 async + Pydantic v2 骨架;租户/
用户/角色模型与注册表;JWT access/refresh 鉴权;console 邮件后端;
Alembic 迁移基线;docker compose dev 栈;ruff/mypy(strict)/pytest
工具链就位。
