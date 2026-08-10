# ParentOS × Nimi App Access 适配报告(第二阶段)

- 执行日期:2026-08-08
- 前置审计:`docs/nimi-app-access-audit.md`(2026-08-07)
- 用户决策:D1=A(维持 `link:` 依赖);D2(AI 设置页 = 姿态卡 + 固定 local intent)、D3(保留 Tauri 构建、删除 `dev:tauri`/Tauri 验收探针、Tauri nimi 集成 defer)、D4(`report_export_*_grant` 改名 save_target)按审计建议执行。
- 平台仓库 `/Users/snwozy/nimi-realm/nimi`(spec-4)全程只读;本报告与证据不进平台仓库。

## 1. 变更总览

### CP1 依赖与工具链
- `vite.config.ts`:删除全部 `@nimiplatform/*` 源码 alias(原 69-99 行)与 `optimizeDeps.exclude` 清单;`manualChunks` 改为 dist 路径匹配(`sdk-client`/`vendor-platform` 等);保留 `fs.allow` 放行 link 目标。
- `tsconfig.json`:删除 28 条指进 `../../nimi` 源码的 `paths`;类型经包 `exports`(`dist/*.d.ts`)解析。renderer typecheck 从"被平台源码 strict 错误污染"变为 0 错误。
- `package.json`:新增 `prepare:workspace-surfaces`(构建 link 目标 sdk/kit 的 dist),链入 `pnpm build`。
- `src/shell/renderer/infra/parentos-platform-source-boundary.test.ts`:边界断言翻转为"禁止源码 alias"。

### CP2 manifest + Electron bridge
- `nimi.app.yaml` 重写为 tester 形态:`profile: standalone`、`app_access: [runtime.consume]`(最小 domain 集)、删 `permissions`/`execution_profile_ref`/`schema_version`/`summary`。`nimi-app doctor` 通过。
- `src-electron/main.ts`:删除 `onProtectedSessionFailure: () => app.quit()`(该字段在当前 kit 注册时同步抛错;session-loss 由 kit 同 Host 有界重绑拥有)。
- `package.json`:删除 `dev:tauri`(app-tools 只接纳 electron)。
- 契约测试同步:`test/electron-host-contract.test.mjs`(manifest 断言 + 禁字段断言)、`src/shell/renderer/bridge/parentos-auth-boundary.test.ts`。`pnpm test:contracts` 16/16 绿。

### CP3 local-app client + 会话姿态
- `infra/parentos-nimi-client.ts`:持有 `NimiLocalAppClient`(`createNimiClient({ localApp: { standardShell: createNimiLocalAppStandardShellSurface() } })`);`createParentOSNimiClient()` 在无桥环境返回 null,永不阻塞本地启动。
- 新增 `infra/runtime-status.ts`:`probeParentosNimiAccess()` → typed posture(ready/action-required/unavailable/bridge-absent,携带 reasonCode/actionHint/retryable)。
- `infra/parentos-bootstrap.ts`:注入 client;fire-and-forget `ensureParentosAIConfigDeclared()`;本地数据水合与 Nimi 访问完全解耦。
- `app-shell/auth-provider.tsx`:bootstrap 失败的 reasonCode 移入折叠 `<details>` 技术区(新增 `Auth.bootstrapFailure.technicalDetails` 文案)。
- `features/settings/settings-page.tsx`:账户卡改接 `currentUser.get()`(`{handle, displayName, avatarUrl}`;email 无新表面对应,移除)。

### CP4 AI 面迁移
- `features/settings/parentos-ai-runtime.ts` 全量重写:唯一执行面 `ai.text.generateCandidate`;发送前 fail-closed 预算守卫(≤8 消息、32KiB/条、64KiB 总量、maxTokens≤4096、roles 仅 system/user,data/file part 与 assistant/tool role 直接 typed 拒绝);删除流式、多模态、STT、executeScenario、targetRef/connectorId 等全部旧面。
- `features/settings/parentos-ai-config.ts` 全量重写:portable capability intent(恰为 `capabilityContract/requiredFeatures/defaults/route`,零 custody 字段);`ensureParentosAIConfigDeclared()`(不覆盖既有声明)、`readParentosAIConfig()`。
- 删除文件:`parentos-ai-config-bootstrap.ts`(first-run 面)、`parentos-ai-config-service.ts`(shared AIConfig)、`parentos-ai-settings-availability.ts`(route-options 探针)、`parentos-route-model-picker-provider.ts`、`parentos-ai-capability-card.tsx`、`infra/parentos-runtime-route-options.ts` 及配套测试。
- `app-store.ts`:移除 `aiConfig` slice(随 SQLite 持久化配置一起退役;pre-alpha 无迁移负担)。
- OCR/STT 门控(产品缺口,typed 不可用,信息态):`checkup-ocr.ts`、`dental-eruption-scan.ts`、`medical-events-page-form-state.ts`、`voice-observation-runtime.ts` 的 runtime 调用全部替换为 `createParentosAISurfaceUnavailableError`;门控函数返回 `isParentosAISurfaceExecutable(...)`(false);死解析链同步删除。
- `advisor-page.tsx`:流式改 unary;四条失败附注文案去除 reasonCode/原始错误插值(机器码不再进终端 UI)。
- `ai-settings-page.tsx` 重写为:Nimi 访问姿态卡(信息态 + 折叠技术区 + 刷新)、AI 能力声明卡(aiConfig.get 展示 + 缺失时可手动声明)、功能可用性清单(文本类可用 / OCR/STT 暂不可用)。
- `scripts/check-parentos-ai-boundary.ts`:marker 集换成新 unary 形态并新增 forbidden 面检测(streamNimiTextResponse/executeScenario/custody 字段等);voice/profile/settings 检查同步。其测试 fixture 同步。
- 验证:`pnpm typecheck` 0 错误;`vitest` 555/555;`pnpm check:ai-boundary` PASS;`pnpm lint` exit 0。

### CP5 残留清零
- D4 改名:`report_export_{create_save_grant,write_grant,register_save_grant}` → `report_export_{create,write,register}_save_target`(renderer/Electron handlers/Rust sidecar/Tauri 注册/全部测试);Rust 私有存储结构改 `PendingReportSaveTarget`。`cargo test` 139/139 绿。
- 删除 `scripts/acceptance-tauri.mjs` 与 `acceptance:tauri` 脚本(Tauri 非接纳载体)。
- `scripts/acceptance-electron.mjs` 探针重写:sessionStatus → aiConfig overwrite/get → textGenerateCandidate positive → realmWorldCoreList/agentReferenceList typed denial(`local-app-access-denied`)→ app-storage base 写入 → runtime.unary 拒绝 → 账户控制拒绝;permission 词汇清零;证据目录更新为 `2026-08-08-app-access-migration`;监督启动改为显式 `--cdp-port`。
- `test/acceptance-script-contract.test.mjs` 同步(禁止 retirement 词汇断言)。
- locale 清理:删除死键(Auth 旧登录流 39 键、Settings.account.logout*、DentalEruptionScan.error.invalidJson/imageInputUnsupported、MedicalEvents.form.ocrNoValidInfo/ocrFailed);删除 ModelConfig 命名空间文件与注册;`ocrRuntimeUnavailable` 改能力缺口文案;"Nimi permission" 措辞改 App Access 语境。`pnpm check:i18n` 通过。
- `AGENTS.md` 更新(架构表、link 消费约定、Electron-only dev、OCR/STT 平台缺口说明)。

## 2. 真实 journey 验收(CDP,平台环境:backend 3002 + Desktop dev + 账户已登录)

环境事件:验收开始时 Desktop↔Runtime 保护通道处于故障态(`runtime-service-untrusted`,tester 参照应用同样失败,证实为环境级问题)。按任务许可杀死 source Runtime 进程(Desktop 为其监督者),Desktop 数秒内重生 Runtime,通道自愈,后续全部绿灯。

### 2.1 监督模式全探针(scripts/acceptance-electron.mjs)

证据:`.nimi/local/acceptance/2026-08-08-app-access-migration/parentos-electron/2026-08-07T19-54-18-056Z/evidence.json`

| 观察项 | 结果 | 证据 |
|---|---|---|
| 签入姿态 | **observed** | sessionStatus `state: ready`;currentUser `{displayName: "Halliday", handle: "@halliday", avatarUrl: null}` |
| Base:AIConfig overwrite+get | **observed** | owner `app:nimi.parentos`;capabilities `[text.generate / local]` 回读一致 |
| 声明 domain `runtime.consume` positive | **observed** | textGenerateCandidate 返回真实文本( finishReason `stop`,traceId `01KZEWNMNNFN7DAPXFJNMZSK40`) |
| 未声明 domain typed denial | **observed** | `realm.world-core.list` 与 `agent.reference.list` 均 `reasonCode: local-app-access-denied`(source: runtime) |
| Base:app-storage 写入 | **observed** | writeJson ok(sizeBytes 35) |
| 直连 Runtime 拒绝 | **observed** | `nimi.shell.runtime.unary` → `capability-unavailable`(不在 local-app-standard-shell-v1) |
| 账户控制面拒绝 | **observed** | `nimi.shell.auth.session.{load,save,clear}` 全部 fail closed |
| app 自有数据面独立可用 | **observed** | `get_family`、媒体写入/删除均 ok |
| 渲染完整性 | **observed** | launch→路由→HMR→双视口无溢出;pageErrors=[];console.error=[] |

### 2.2 Runtime 杀伤 → typed unavailable → 同 Host 恢复(scripts/journey-runtime-recovery.mjs)

证据:`.nimi/local/acceptance/2026-08-08-app-access-migration/parentos-electron-runtime-recovery/2026-08-07T19-59-42-863Z/journey-evidence.json`

| 观察项 | 结果 | 证据 |
|---|---|---|
| CDP 只挂本 App target | **observed** | attachedTarget = `http://127.0.0.1:1426/`(未触 Desktop/其他宿主) |
| 杀伤前会话 | **observed** | sessionStatus `ready`,currentUser `@halliday` |
| 杀 source Runtime(仅该进程) | **observed** | pid 88025 SIGTERM;Desktop 监督者数秒内重生为 pid 88921 |
| 中断窗 typed unavailable | **observed** | 杀伤后 textGenerateCandidate 返回 typed `runtime-service-unavailable`(有界,非崩溃) |
| 同 Host 恢复 | **observed** | ~24s 后同一宿主内 sessionStatus ready + textCandidate 成功;无人工干预 |
| App 不退出/不换 Host | **observed** | runtime 重启全程 renderer 存活、bridge 可用(`appSurvivedRuntimeRestart: true`)——`onProtectedSessionFailure` 自杀式处理已根除 |
| 显式退出清理 | **observed** | `/v1/cancel` → run `state: stopped`;Electron 宿主进程消失(`electronHostGone: true`) |

### 2.3 终端 UI 姿态(scripts/journey-ui-posture.mjs)

证据:`.nimi/local/acceptance/2026-08-08-app-access-migration/parentos-electron-ui-posture/2026-08-07T20-10-12-727Z/journey-evidence.json`(截图 ai-settings.png / settings-home.png 同目录)

| 观察项 | 结果 | 证据 |
|---|---|---|
| AI 设置页姿态卡 | **observed** | 「Nimi 访问」卡显示信息态「已连接」,无告警色、无机器码 |
| 能力声明卡 | **observed** | `text.generate` · 本地路由;无 connector/custody 字段 |
| 功能可用性清单 | **observed** | 文本类「可用」;OCR/语音转写「暂不可用」(信息态) |
| 机器码折叠纪律 | **observed** | `machineCodeOutsideDetails: false`(ready 态无折叠区,未配置/异常态才出现 details) |
| 设置首页账户卡 | **observed** | 显示 `Halliday` / `@halliday` 与「由 Nimi 桌面统一管理」文案;无 email 字段 |

(注:首次观察因 full-page reload 触发启动门、第二次因欢迎引导遮挡,两次空结果均为观察脚本问题,已修正后以 pushState SPA 导航完成观察;欢迎引导页截图亦正常。)

## 3. 残留与缺口状态

- 平台侧缺口(仅登记):npm 发布滞后(sdk 同号陈旧/kit 0.3.0/app-tools 0.2.0 未发布、protected-local 404)、脚手架模板仍发已删字段、darwin 外部应用自助开发路径不明朗——详见审计报告 §8。
- 产品缺口(typed 不可用,未自造):OCR ×3、STT ×1、模型路线枚举、账户 email。
- `.nimi/spec/**` 与 `data/structured/**` 中的 "permission" 字样均为产品自有权威文档的否定式表述(如"不创建 manifest permission"),属既有产品权威,未改动。
- CI 在 D1=A 下仍红(link: 依赖无法上 runner),待平台发布后迁移 npm semver 解决——已在审计报告 §6 登记。

## 4. 引用自检

2026-08-08 随机抽 5 条 re-grep 复核,全部命中:

1. `src-electron/main.ts` 无 `onProtectedSessionFailure` —— `grep -c` = 0 ✓
2. `nimi.app.yaml:3,5-6` —— `profile: standalone` / `app_access:` / `- runtime.consume` ✓
3. `src/shell/renderer/features/settings/parentos-ai-runtime.ts` 含 `generateCandidate` 与预算守卫(`MAX_CANDIDATE_PROMPT_BYTES`、`parentos-ai-input-over-budget` 等 7 处)✓
4. `src/shell/renderer/features/settings/parentos-ai-config.ts:20-22` —— `capabilityContract: PARENTOS_TEXT_CAPABILITY_CONTRACT`、`route: { oneofKind: 'local', local: {} }` ✓
5. `scripts/acceptance-electron.mjs:161,195,201` —— `local-app.realmWorldCoreList` 探针与 `local-app-access-denied` 断言 ✓
