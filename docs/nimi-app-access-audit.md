# ParentOS × Nimi App Access 对接审计报告(第一阶段,只读)

- 审计日期:2026-08-07
- 审计范围:`/Users/snwozy/nimi-realm/nimi-apps/nimiapp-parentos`(本仓库,HEAD `e510434`,工作区干净)
- 平台参照:`/Users/snwozy/nimi-realm/nimi`(分支 `spec-4`,HEAD `21aefa02b`,只读引用,未做任何修改)
- 本阶段未修改任何文件;本报告是唯一产出。

## 0. 结论摘要

1. **ParentOS 当前对平台是"全断"状态,适配是必需而非可选**:
   - `nimi.app.yaml` 仍含 `permissions: []`(nimi.app.yaml:13)且无 `app_access`;平台 runtime 的 manifest 解析器**硬拒** `permissions` 键("legacy permissions are not admitted")并**强制要求** `app_access`(`nimi/runtime/internal/services/app/local_development_manifest.go:66-79`)。
   - `src-electron/main.ts:42` 传入 `onProtectedSessionFailure: () => app.quit()`;当前 kit 的 `registerNimiElectronAppBridge` 对任何非白名单键**同步抛错** `'electron-local-app-bridge-input-forbidden'`(`nimi/kit/shell/electron/src/main/app-bridge.ts:45,133-153`;该字段删除公告见 `nimi/kit/CHANGELOG.md:25-29`)。即 Electron 壳在当前平台源码下**启动即崩**。
   - renderer 的 NimiClient 在生产代码里从不创建——`setParentOSNimiClient` 唯一生产调用是置 `null`(src/shell/renderer/infra/parentos-bootstrap.ts:60),全部 AI 功能当前实际不可用。
2. **基线验证本来就红**:`pnpm typecheck` 失败(错误全部来自 link 进来的平台 SDK **源码** `../../nimi/sdks/typescript/types/sha256.ts` 的 strict 报错,经 tsconfig.json:6-33 的 paths 渗入);GitHub CI 最近 3 次运行全部 failure(`gh run list`,2026-08-01 最近一次为 TS2307 找不到 `@nimiplatform/*` —— link: 依赖在 runner 上不存在)。
3. **最小 domain 集 = `["runtime.consume"]`**:ParentOS 只消费文本生成;不用 Realm(不声明 `realm.data`)、不自建也不消费 nimi agent(不声明 `agent.local`)。
4. **4 个产品能力在新契约(14 操作)中无对应面**,列为产品缺口,不自造:3 个 OCR/vision surface、1 个 STT surface、模型路线枚举(model picker 依赖)、设置页账户 email 字段。
5. **工具链最大缺口**:平台意向的外部消费模型是 npm 发布包,但 **App Access 重构尚未发布**——npm 上 `@nimiplatform/sdk@0.6.0`(2026-05-25)tarball 内 `local-app` 文件数为 0;`@nimiplatform/kit` npm 最新 0.2.0 vs 仓库 0.3.0;`@nimiplatform/app-tools` npm 0.1.3 vs 仓库 0.2.0;两个 `kit-protected-local` 原生包 npm 404。短期内只能继续 `link:` 到 sibling 检出(或 vendor tgz),CI 因此无法转绿。

## 1. 现状盘点

### 1.1 依赖消费方式(关键问题)

| 依赖 | 现状 | 位置 |
|---|---|---|
| `@nimiplatform/sdk` | `link:../../nimi/sdks/typescript` | package.json:91;pnpm-workspace.yaml:6 override;pnpm-lock.yaml:15-19 |
| `@nimiplatform/kit` | `link:../../nimi/kit` | package.json:90;pnpm-workspace.yaml:5 override |
| `@nimiplatform/app-tools` | `link:../../nimi/app-tools` | package.json:59 |
| `@nimiplatform/kit-protected-local-win32-x64` | `link:../../nimi/kit/shell/protected-local-node/npm/win32-x64` | package.json:60 |
| `@nimiplatform/nimi-coding` | **已发布 semver `0.4.0`**(npm 最新 0.5.0) | package.json:63;pnpm-lock.yaml:834 |
| `nimi-shell-tauri`(Rust) | `path = "../../../nimi/kit/shell/tauri"` | src-tauri/Cargo.toml:23 |

并且不是消费 dist,而是**源码级耦合**:

- `vite.config.ts:8-10` 计算 `nimiRepoRoot = ../../nimi`,vite.config.ts:69-99 把 `@nimiplatform/sdk/*`、`@nimiplatform/kit/*` alias 到平台仓库的 `.ts` 源码;vite.config.ts:167-172 `fs.allow` 放行平台仓库。
- `tsconfig.json:6-33` 的 `paths` 同样直指 `../../nimi/**/index.ts`(renderer typecheck 因此把平台源码纳入编译,平台源码自身的 strict 错误直接打挂 parentos,见 §0.2)。
- `scripts/package-electron.mjs:15-16` 打包时从 `../../nimi` `pnpm pack` 取 tgz(scripts/package-electron.mjs:80-81),并硬编码 `@nimiplatform/kit-protected-local-win32-x64` 版本 `0.2.0`(scripts/package-electron.mjs:51)。

**与参照的差距**:tester/zhiyu 在 nimi monorepo 内部,用 `workspace:*` + `prepare:workspace-surfaces`(`nimi/apps/tester/package.json:12,24-25,34`;`nimi/apps/zhiyu/package.json:11,20-21,28`)。平台为**外部** standalone 应用设计的模型是 npm 发布包:`nimi/app-tools/lib/app-scaffold.mjs:256-268` 模板对非 workspace-app 发 `@nimiplatform/sdk@^0.6.0`、`@nimiplatform/kit@^0.3.0`、`@nimiplatform/app-tools@^0.2.0`(版本常量 `nimi/app-tools/lib/index.mjs:9-35`),Rust 侧发 crates.io `nimi-shell-tauri = "0.1.0"`(app-scaffold.mjs:290-295;crates.io sparse index 确认 0.1.0 已发布)。**但这些 npm 包当前内容是重构前的**(见 §0.5 与 §6-P1)。

### 1.2 manifest / 启动方式

- `nimi.app.yaml:1-13`:`schema_version: 1`、`profile: workspace-app`(第 4 行)、`manifest_role: submitted-input`、`local_development.electron.renderer_origin: http://127.0.0.1:1426`(第 11 行)、`execution_profile_ref: opaque:windows-native-electron-development-v1`(第 12 行,平台侧已无任何解析器认这个键)、`permissions: []`(第 13 行,平台硬拒)、**无 `app_access`**。
- 启动:`package.json:15-19` `dev`/`dev:electron` = `nimi-app dev --shell electron`,`dev:renderer` = `vite ... --port 1426 --strictPort`(与 manifest origin 一致,符合 Desktop 对脚本精确性的要求,`nimi/apps/desktop/src-electron/local-development-plan.ts:46-56`)。`dev:tauri`(package.json:18)调 `nimi-app dev --shell tauri` —— 新 app-tools **只接纳 electron**,其他值直接抛 `'local-development-platform-unsupported'`(`nimi/app-tools/scripts/dev-shell.mjs:324-332`),该脚本必死。
- 端口 1426 与 tester 1468(`nimi/apps/tester/nimi.app.yaml:11`)、zhiyu 1472(`nimi/apps/zhiyu/nimi.app.yaml:9`)不冲突,可保留(满足独占端口要求;strictPort 竞态是已知平台问题,见 §7-R6)。

### 1.3 Electron 主进程 bridge

- `src-electron/main.ts:38-47` 已用 `registerNimiElectronAppBridge`,但带了已删除的 `onProtectedSessionFailure: () => app.quit()`(main.ts:42)——在当前 kit 下同步抛错(main.ts:59-63 的 `handleElectronStartupFailure` 接住后 `app.quit()`,表现为启动即退)。新契约下 session 丢失由 kit 的 `withBoundedSessionRebind` 做同 Host 有界重绑(`nimi/kit/shell/electron/src/main/local-app-host.ts:215-250`),App 侧正确姿态是显示 typed unavailable,**不得退出**。
- bridge 的 `appCommandHandlers` 注册 130+ 条 app 自有命令(src-electron/parentos-command-handlers.ts:7-133),经 sidecar(Rust `parentos_host`,JSON-lines stdio,src-electron/parentos-host-client.ts:89-160)落到本地 SQLite。这是 app 私有数据面,符合"数据严格本地私有",**不需要改**。
- preload(src-electron/preload.cts:1-7)用 `installNimiElectronRuntimeBridge`,renderer 钩子(src/shell/renderer/infra/tauri-runtime-hook.ts:6-8)用 `installNimiShellRuntimeBridge` —— 均为 kit 现行面,保留。
- Tauri 壳:src-tauri/src/main.rs:3,23,34 使用 `nimi-shell-tauri` crate 的 `RuntimeBridgeLocalAppHost::platform_default()` 与 standard shell handler 宏。Tauri 不是被接纳的本地开发载体(§1.2),Tauri 壳去留是产品决策项(§5-D3)。

### 1.4 renderer 侧 nimi 调用点全枚举(rg 结果,非叙事)

**客户端持有/创建**:
- src/shell/renderer/infra/parentos-nimi-client.ts:1-18 — `NimiClient` 单例持有;生产代码只置 null(src/shell/renderer/infra/parentos-bootstrap.ts:60),`getParentOSNimiClient()` 运行时必抛(parentos-nimi-client.ts:13-17)。`createNimiLocalAppStandardShellSurface` 仅从 bridge/index.ts:6 再导出,**无任何生产调用点**。

**AI 执行(全部旧 first-party 面,集中在 src/shell/renderer/features/settings/parentos-ai-runtime.ts)**:
- `runtime.ai.executeScenario`(wire-types `ExecuteScenarioRequest`):parentos-ai-runtime.ts:707(文本多模态)、:736(语音转写 `ScenarioType.SPEECH_TRANSCRIBE`)。
- `createNimiRuntimeAIModel` + `runNimiTextGenerate`:parentos-ai-runtime.ts:518-531(unary 文本)。
- `streamNimiTextResponse`(**流式**):parentos-ai-runtime.ts:553;调用方 src/shell/renderer/features/advisor/advisor-page.tsx:569(带 :588 非流式回退)。
- `runtime.ready()`:parentos-ai-runtime.ts:255。
- 请求头携带 `connectorId` / `targetRef`(cloud-connector: connectorId+remoteModelCatalogId+providerModelId;local-runtime: profileBindingId/readinessRef):parentos-ai-runtime.ts:213-246 —— 属 ConnectorGrant/custody 形态字段,新契约逐层拒绝。

**AI 调用方(surface 清单见 src/shell/renderer/features/settings/parentos-ai-surface-policy.ts:28-101,共 9 族 + `parentos.profile.summary.*`)**:
| surface | 输入类型 | 调用点 |
|---|---|---|
| `parentos.advisor` | 文本(流式+unary) | advisor-page.tsx:569,588;advisor-suggestion-engine.ts:125 |
| `parentos.report` | 文本 | reports/narrative-prompt.ts:484 |
| `parentos.medical.smart-insight` / `event-analysis` | 文本 | medical-events-page-insights.ts:101,153 |
| `parentos.journal.ai-tagging` | 文本 | journal/ai-journal-tagging.ts:156 |
| `parentos.profile.summary.*` | 文本 | profile/ai-summary-card.tsx:153 |
| `parentos.profile.checkup-ocr` | **vision** | profile/checkup-ocr.ts:301(:234 文本修复) |
| `parentos.profile.dental-eruption-scan` | **vision** | profile/dental-eruption-scan.ts:279(:214 文本修复) |
| `parentos.medical.ocr-intake` | **vision** | profile/medical-events-page-form-state.ts:103 |
| `parentos.journal.voice-observation` | **STT** | journal/voice-observation-runtime.ts:44 |

**AIConfig(配置面)**:
- 持久化在自有 SQLite `app_setting` 键 `parentos:ai-config:v1`(src/shell/renderer/features/settings/parentos-ai-config.ts:12,295-318),形状含上述 custody 字段(parentos-ai-config.ts:163-208)。
- `parentos-ai-config-service.ts:88-157` 实现 kit `SharedAIConfigService`(shared LocalAgent AIConfig 形态);`parentos-ai-config-bootstrap.ts:93` 用 `getNimiRuntimeProductControlRecord(client.runtime.generated)` 读 first-run 证据(平台已无此面,当前 fail-closed,见该文件 70-74 注释)。
- 模型选择:`parentos-route-model-picker-provider.ts:15-24` 与 `parentos-runtime-route-options.ts:38-47` 用 `listNimiRuntimeRouteOptionsWithHost(client.runtime)` 枚举路线;UI 在 ai-settings-page.tsx:184-208 + parentos-ai-capability-card.tsx:32-36(kit model-picker)。可用性探针 parentos-ai-settings-availability.ts:21-42。

**账户/会话**:
- app-store auth slice(src/shell/renderer/app-shell/app-store.ts:15,41-42,70-85)生产环境无人写入;设置页账户卡(settings-page.tsx:127-144)显示 `authUser.displayName`/`authUser.email`(:136-138)。
- 会话丢失处理 = Electron 主进程 `app.quit()`(src-electron/main.ts:42),renderer 无姿态面;advisor 可用性仅 `hasParentOSNimiClient()`(advisor-page.tsx:642;reports-page.tsx:96;auto-report.ts:21 等)。

**存储**:全部走自有 SQLite/文件命令(sidecar 或 Tauri),未使用 `runtime.app-storage.json.*`。

**未使用**:Realm 直连(全仓零命中)、`agents.*` / conversation、`SendAppMessage`、`localAgentId`、artifact put/read、voice 流(§2 扫描佐证)。

## 2. 残留清单(逐条 file:line)

### 2.1 致命残留(直接违反新契约,FAIL 项)

| # | 残留 | 位置 |
|---|---|---|
| F1 | `onProtectedSessionFailure: () => app.quit()` —— 已删字段 + 自杀式 session-loss | src-electron/main.ts:42 |
| F2 | manifest `permissions: []`(平台硬拒)+ 缺 `app_access`(平台强制) | nimi.app.yaml:13;对照 `nimi/runtime/internal/services/app/local_development_manifest.go:66-79` |
| F3 | `runtime.ai.executeScenario` 旧 first-party 执行面 | parentos-ai-runtime.ts:707,736 |
| F4 | 流式生成(新契约 unary-only,无 stream) | parentos-ai-runtime.ts:553;advisor-page.tsx:569 |
| F5 | custody 形态 targetRef(connectorId/profileBindingId/readinessRef)随请求与持久化配置 | parentos-ai-runtime.ts:213-246;parentos-ai-config.ts:163-208 |
| F6 | `getNimiRuntimeProductControlRecord(client.runtime.generated)` first-run 面 | parentos-ai-config-bootstrap.ts:3,93 |
| F7 | `runtime.ready()` | parentos-ai-runtime.ts:255 |
| F8 | route-options 枚举(无对应新操作) | parentos-runtime-route-options.ts:43-46;parentos-route-model-picker-provider.ts:18-21 |

### 2.2 permission/旧平台词汇残留(应清零)

| # | 残留 | 位置 |
|---|---|---|
| V1 | 验收脚本探针 `local-app.permissionStatus`("reserved permission" `agents.interact`)、`local-app.sessionStatus`、`runtime.unary` 伪装拒绝、`nimi.shell.auth.session.*` 拒绝探针、"base entitlement" 语义 | scripts/acceptance-electron.mjs:21,116-171,190-198;scripts/acceptance-tauri.mjs:74-102 |
| V2 | 契约测试把 `local-app.permissionStatus`/`sessionStatus` 固化为验收要素 | test/acceptance-script-contract.test.mjs:29-37 |
| V3 | 契约测试把 manifest `permissions: []` 与 `execution_profile_ref` 固化为断言 | test/electron-host-contract.test.mjs:85-92;src/shell/renderer/bridge/parentos-auth-boundary.test.ts:21 |
| V4 | AI 边界检查脚本把 `streamNimiTextResponse({`、`ScenarioType.SPEECH_TRANSCRIBE` 等旧 helper 形态固化为必须存在的 marker | scripts/check-parentos-ai-boundary.ts:408-426(同 scripts/check-parentos-ai-boundary.test.ts:139) |
| V5 | `dev:tauri` 脚本(平台不接纳的载体) | package.json:18 |
| V6 | 注释/i18n 中的 "Nimi permission" 否定式表述(语义正确但词汇应随新模型更新为 App Access 语境) | src/shell/renderer/infra/parentos-bootstrap.ts:18,110;locales/en.json:59;parentos-bootstrap.test.ts:55;parentos-ai-config.test.ts:146 |

### 2.3 词汇重叠但属 app 内部语义(建议改名以免误判,非平台残留)

- `report_export_create_save_grant` / `report_export_write_grant` / `report_export_register_save_grant`:报告导出的"一次性保存目标授权",纯 app 内部(src-electron/parentos-command-handlers.ts:13,154-155,205;src/shell/renderer/features/reports/report-export.ts:66-103;src-tauri/src/main.rs:41-42)。建议 phase 2 改名为 `*_save_target` 以彻底避开 grant 词汇。
- `URL.revokeObjectURL` / `revokeVoicePreviewUrl`(journal 录音预览):浏览器 API,无关(journal-page.tsx:217 等;voice-observation-recorder.ts:173)。
- `toolApprovalResponses: []`:旧 ChatMessage wire 字段(parentos-ai-runtime.ts:636),随 F3 一起删除。

### 2.4 确认零命中项

`SendAppMessage`/`sendAppMessage`、`agents.configure`、`localAgentId`、artifact put/read、voice 流、直连 Realm URL/credential、durable agent handle 持久化 —— 全仓(rg,排除 node_modules/dist/target)零命中。

## 3. 映射表(现有能力 → 新契约)

新契约事实来源:14 操作 map `nimi/runtime/internal/localappop/contract.go:79-94`;SDK 客户端面 `nimi/sdks/typescript/core/app/local-app-runtime-platform.ts:165-206`;未声明 domain → `PermissionDenied`/`local-app-access-denied`,未知操作 → `Unimplemented`/`local-app-operation-unsupported`(contract.go:10,111-123;`nimi/runtime/internal/services/app/local_app_session_kernel.go:295-300`)。

| 现有能力 | 现状位置 | 新表面 | 处置 |
|---|---|---|---|
| 文本生成(advisor 回退路径、report、insights、tagging、summary 共 6 族 surface) | parentos-ai-runtime.ts:508-531 等 | `ai.text.generateCandidate`(AppAccess,`runtime.consume`) | **替换**。适配 unary 界:≤8 条消息、32KiB/条、64KiB 总量、maxTokens≤4096、roles 仅 system/user、无 stream/tool/attachment(local-app-runtime-platform.ts:262-266,275-316)。参照调用:`nimi/apps/tester/src/tester/imp4-app-access-panel.tsx:361-366` |
| Advisor 流式输出 | advisor-page.tsx:569-599 | 无 | **删除流式**,unary + loading 态;不做伪流式 |
| Vision/OCR ×3(checkup-ocr、dental-eruption-scan、ocr-intake) | checkup-ocr.ts:301 等 | 无 | **产品缺口 G1**(见 §4),不自造 |
| STT 语音转写 | voice-observation-runtime.ts:44 | 无 | **产品缺口 G2**,不自造 |
| 模型路线枚举 + model picker UI | parentos-route-model-picker-provider.ts;parentos-runtime-route-options.ts;ai-settings-page.tsx:184-208 | 无(14 操作无列举) | **产品缺口 G3**:删除 picker;AI 设置改为 portable intent 编辑 |
| AIConfig 持久化(custody 形态) | parentos-ai-config.ts:12,163-208 | `aiConfig.get/overwrite`(Base 类,无需 domain);intent 键恰为 `capabilityContract/requiredFeatures/defaults/route`,authority 材料被拒(`nimi/sdks/typescript/core/app/local-app-runtime-platform-ai-config.ts:24-29,58-64`;类型 `nimi/sdks/typescript/core/ai/capability-configuration.ts:19-31`) | **迁移**:overwrite `[{capabilityContract:'text.generate',requiredFeatures:[],route:{oneofKind:'local',local:{}}}]`(参照 `nimi/apps/tester/src/tester/imp4-app-access-panel.tsx:59-65`);剥离 custody;旧 SQLite key 清理(pre-alpha 无迁移负担) |
| first-run 证据引导 | parentos-ai-config-bootstrap.ts | 无 | **删除整文件**(已 fail-closed) |
| `runtime.ready()` | parentos-ai-runtime.ts:255 | 无 | 删除 |
| 会话/访问姿态 | main.ts:42(app.quit) | `auth.status()` → `{state, sessionBound, reasonCode, actionHint, retryable}`,state ∈ session-bound/action-required/revoked/project-changed/process-replaced/account-changed/runtime-restarted/unavailable(local-app-runtime-platform.ts:71-100,561-664);kit 负责同 Host 有界重绑(local-app-host.ts:215-250) | **新增** runtime-status 模块(照 `nimi/apps/zhiyu/src/shell/runtime/runtime-status.ts:8-46` 模式):typed unavailable 卡片 + 重试;App/Host 不退出 |
| 设置页账户卡 | settings-page.tsx:127-144 | `currentUser.get()` → `{handle, displayName, avatarUrl}`(**无 email**) | 改写字段;email 列入 **产品缺口 G4** |
| 本地数据(SQLite/媒体/报告导出) | sidecar/Tauri 130+ 命令 | `runtime.app-storage.json.*` 是 Base 类但非必需 | **保持自有 SQLite 不动** |
| Realm | 未使用 | `realm.world-core.*`(`realm.data`) | **不声明** |
| Agent | 未使用(advisor 是自有域对话,非 nimi 全局 agent) | `agents.listReferences` + conversation ×5(`agent.local`) | **不声明** |
| Electron bridge | main.ts:38-47 | 同名,白名单键 `{appId, allowedRendererUrls, ipcMain, appCommandHandlers?}` | 删 F1 字段,其余不动 |
| manifest | nimi.app.yaml | tester 形态(`nimi/apps/tester/nimi.app.yaml:1-11`) | `profile: standalone`、加 `app_access: [runtime.consume]`、删 `permissions` 与 `execution_profile_ref`、`schema_version`(runtime 忽略未知键,但按 tester 最简形态收紧) |
| 验收脚本 | acceptance-{electron,tauri}.mjs | 新探针集(见 §5-CP5) | 重写 |

**声明 domain 结论:`app_access: [runtime.consume]`(最小集)。**

## 4. 产品缺口清单(新表面无对应,登记,不自造)

| # | 缺口 | 影响面 | 建议姿态 |
|---|---|---|---|
| G1 | 无 vision/多模态生成面 | 体检 OCR(checkup-ocr.ts)、牙列扫描(dental-eruption-scan.ts)、医疗事件 OCR 录入(medical-events-page-form-state.ts:103) | 入口显示 typed"暂不可用"(信息态),保留手动录入;向平台登记需求 |
| G2 | 无 STT 面 | 语音观察转写(voice-observation-runtime.ts:44);录音与回放本身是全本地 MediaRecorder,不受影响 | 录音保留,转写按钮 typed 不可用;向平台登记需求 |
| G3 | 无模型路线枚举面 | AI 设置页 model picker 无法列举可用路线 | 设置页收缩为 intent(route local/cloud + temperature/topP/maxTokens);cloud 无绑定时 `ai-connector-grant-selection-required` 是合法有界结果,按信息态呈现 |
| G4 | `currentUser.get()` 无 email | 设置页账户卡 settings-page.tsx:136-138 | 改显 handle/displayName;email 移除 |

## 5. 适配改造计划(第二阶段,分 checkpoint;每个 checkpoint 保持可构建 + focused 测试绿)

**CP0 — 决策确认(动工前,需用户拍板)**
- D1 依赖模型(三选一,详见 §6):A 维持 link:、B vendor tgz、C 等平台发布后上 npm。**建议 B**。
- D2 AI 设置页形态:intent 编辑器 vs 暂时隐藏模型区只留姿态卡。**建议先做姿态卡 + 固定 local intent,编辑器后议**。
- D3 Tauri 壳去留:平台只接纳 Electron 本地开发(dev-shell.mjs:324-332)。**建议保留 src-tauri 构建(cargo 测试照跑),删 `dev:tauri`/`acceptance-tauri.mjs` 的 nimi 集成探针,Tauri 的 nimi 集成整体defer**;是否最终下线 Tauri 由产品决定。
- D4 `report_export_*_grant` 改名(去 grant 词汇)。**建议改**。

**CP1 — 依赖与工具链**
按 D1 执行;移除 vite.config.ts:69-99 与 tsconfig.json:6-33 的源码 alias/paths(改消费 dist 类型);保留端口 1426;验收:`pnpm typecheck` 绿(当前红,§0.2)、`pnpm build:renderer` 绿。

**CP2 — manifest + Electron bridge**
nimi.app.yaml 改 tester 形态(`app_access: [runtime.consume]`);main.ts:42 删 `onProtectedSessionFailure`;同步 test/electron-host-contract.test.mjs:85-92、bridge/parentos-auth-boundary.test.ts:21 断言;`pnpm doctor`(`nimi-app doctor`)过。

**CP3 — 客户端接入 + 会话姿态**
新建 local-app client(`createNimiClient({ localApp: { standardShell: createNimiLocalAppStandardShellSurface() } })`,参照 `nimi/apps/zhiyu/src/shell/auth/runtime-platform.ts:46-52`),bootstrap 实际注入(替换 parentos-bootstrap.ts:60 的 null);新增 runtime-status 模块(照 zhiyu runtime-status.ts:8-46);auth-provider.tsx:62 的 reasonCode 直显改折叠技术区;设置页账户卡接 `currentUser.get()`。

**CP4 — AI 面迁移(逐调用点)**
aiConfig 迁 `aiConfig.get/overwrite`(剥 custody);`runParentosTextGenerate` 改 `ai.text.generateCandidate`(加 64KiB 预算守卫,fail-closed);删流式/multimodal/STT/route-options/model-picker/first-run bootstrap(F3-F8);G1/G2 功能入口改 typed 不可用(信息态);`scripts/check-parentos-ai-boundary.ts:408-426` marker 集同步换新形态。验收:`pnpm test`、`pnpm check:ai-boundary` 绿。

**CP5 — 残留清零 + 验收脚本重写 + UI 文案**
V1-V6 全清;acceptance-electron.mjs 探针重写为:签入姿态(auth.status)、`runtime.consume` positive、未声明操作(如 `realm.world-core.list`)typed denial(`local-app-access-denied`)、杀 source Runtime 进程后 typed unavailable → 同 Host 恢复;机器码一律进折叠技术区,首次/未配置态用信息态文案(locales zh.json:52,654,656 等)。

**CP6 — 真实 journey 验收(平台环境 up:backend 3002 + Desktop dev,账户已登录)**
`nimi-app dev --shell electron -- --cdp-port <运行时选空闲端口>`;CDP 只挂本 App 精确 target;观察:签入姿态 / 每个声明 domain(仅 runtime.consume)≥1 positive / 1 个未声明操作 typed denial / Runtime 进程杀后恢复 / 显式退出清理;诚实记 `not_observed`;证据落 `.nimi/local/acceptance/**`(项目惯例),不进平台仓库。

## 6. 工具链差距与接入方案

平台意向:npm 发布包(app-scaffold.mjs:256-268 + README 的 `pnpm dlx` 脚手架路径)。**现实:重构未发布**(§0.5;`npm view` 实测:sdk 0.6.0 tarball 无 `local-app` 文件、kit npm 0.2.0≠仓库 0.3.0、app-tools npm 0.1.3≠仓库 0.2.0、protected-local 两变体 404;crates.io 有 `nimi-shell-tauri@0.1.0`)。

| 选项 | 做法 | 优点 | 代价/风险 |
|---|---|---|---|
| A 维持 link: | 现状不变,仅修代码面 | 零依赖动作;与 journey 环境同源 | CI 持续红;换机/协作不可复现;typecheck 被平台源码污染(§0.2) |
| B vendor tgz(**建议**) | 从 sibling 检出 `pnpm pack` sdk/kit/app-tools 到 `vendor/*.tgz` 并提交,deps 改 `file:vendor/...`;Rust crate 切 crates.io `nimi-shell-tauri = "0.1.0"`(需验证与 spec-4 一致) | CI 可绿;可复现;不依赖发布节奏 | 提交二进制 tarball;需写同步脚本;kit 0.3.0 内容以本地检出为准 |
| C 等平台发布 | 先只做 CP2-CP5 代码面,依赖不动 | 最终形态最干净 | 平台发布节奏不可控;CI 继续红 |

无论哪项,后续平台发布正式版后都应迁回 npm semver(选项 C 的终态)。

## 7. 风险

- R1 **npm 发布滞后**(同 §6):适配后的代码只能对 link/vendor 的平台工件验证;npm 终态需二次验证。
- R2 **平台版本号/内容错位**:npm `@nimiplatform/sdk@0.6.0` 与仓库 0.6.0 同号不同内容,消费时必须锁 hash/ tarball,不能用裸 semver 假设内容。
- R3 **unary 预算**:advisor/report 的 prompt 含 contextSnapshot JSON,可能逼近 64KiB 总量上限;CP4 需加发送前字节预算守卫(超限 typed 失败并收缩快照,不静默截断)。
- R4 **OCR/STT 停用**是用户可见功能回退(G1/G2),文案需按"暂不可用"信息态处理,且 journal.ai-tagging 的 prompt 模板当前含"语音转写"语境时需一并梳理。
- R5 **journey 环境依赖**:需 backend(3002)+ Desktop dev 同时运行且人类已登录;Desktop 会自行 spawn `build:electron`/`dev:renderer`(local-development-host.ts:400-439),`dist-electron/main.js` 必须可由 `build:electron` 产出。
- R6 **strictPort 竞态**(已知平台问题):1426 被占时 dev 失败,需重试或换端口并同步 manifest/renderer_origin(dev:renderer 端口与 manifest 必须一致,doctor 强制,app-doctor-update.mjs:418-461)。
- R7 **Tauri  crate 新鲜度**:crates.io `nimi-shell-tauri@0.1.0` 与 spec-4 源码一致性未验证(D3 若保留 Tauri 构建则需验证)。
- R8 验收脚本重写后,`.nimi/local/acceptance/` 旧证据目录命名(如 `2026-07-18-app-launch-migration-wave`,scripts/acceptance-electron.mjs:12-19)需更新,避免新旧证据混淆。

## 8. 平台侧缺口登记(只登记,不跨仓库修)

- P1 npm 发布滞后/错位:`@nimiplatform/kit@0.3.0`、`@nimiplatform/app-tools@0.2.0` 未发布;`@nimiplatform/sdk@0.6.0` 同号陈旧(无 local-app 面);`kit-protected-local-{win32-x64,darwin-arm64}` npm 404(release-kit.yml 仅发 win32 且未见发布记录)。
- P2 app-tools 脚手架模板仍发 `onProtectedSessionFailure: () => app.quit()`(`nimi/app-tools/lib/app-scaffold-profiles.mjs:253`),与 kit 白名单校验冲突,新脚手架出来的 app 启动即崩。
- P3 darwin 本地开发的 protected carrier 依赖 Desktop packaged host 或源码检出内 native entry(`nimi/kit/shell/electron/src/main/protected-local-binding-loader.ts:73-107`),对外部 standalone 应用的 macOS 自助开发路径不明朗(win32 有 npm 包路径但包未发布)。

## 9. 引用自检(写完后随机抽 5 条 re-grep 复核)

2026-08-07 实抽 5 条,全部命中:

1. `src-electron/main.ts:42` —— `sed -n '42p'` 输出 `    onProtectedSessionFailure: () => app.quit(),` ✓
2. `nimi/runtime/internal/services/app/local_development_manifest.go:66-79` —— `sed -n '60,80p'` 输出含 `legacy permissions are not admitted`(66-68 行)与 `local app manifest requires app_access`(74-76 行)✓
3. `nimi/kit/shell/electron/src/main/app-bridge.ts:15-16,45` —— 输出 `REQUIRED_INPUT_KEYS = ['allowedRendererUrls', 'appId', 'ipcMain']`、`OPTIONAL_INPUT_KEYS = ['appCommandHandlers']`,第 45 行 `assertExactAppBridgeInput(input);`(注册函数首句)✓
4. `src/shell/renderer/features/settings/parentos-ai-runtime.ts:736` —— 输出 `const response = await getParentOSNimiClient().runtime.ai.executeScenario({` ✓
5. `nimi/apps/tester/src/tester/imp4-app-access-panel.tsx:361-366` —— 输出 `client.ai.text.generateCandidate({ messages: [{ role: 'user', text: ... }], temperature: 0, topP: 1, maxTokens: 32 })` ✓
