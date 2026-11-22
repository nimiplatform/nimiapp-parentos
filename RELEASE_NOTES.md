## 0.1.10 · Bilingual Storefront, native release alignment & platform baseline upgrade

- Upgraded to public npm `@nimiplatform/app-tools@0.16.0-rc.14`, `@nimiplatform/sdk@0.24.0-rc.11`, and `@nimiplatform/kit@0.24.0-rc.18` with frozen registry lockfile and updated native release workflow.
- Switched the Electron main process packaging to a pure single-file bundle without `node_modules` staging (shipping only the target platform's protected-local native binding and the Rust `parentos_host` sidecar) and enabled deterministic bounded Deflate `.nimiapp` compression.
- Added complete bilingual Nimi App Storefront presentation (`lifestyle` category, Chinese/English user introductions `NIMI_APP.md` and `NIMI_APP.en.md`, tags, highlights, localized 16:9 cover artwork, and 5 localized product screenshots) packaged separately in the release's aggregated storefront media archive without increasing native installer size.
- Aligns the native desktop release (`windows-x86_64`, `macos-aarch64` Electron + Rust SQLite sidecar) with the admitted hosted Web edition (`0.1.10`, `https://parentos.nimi.xyz/`).

## Current source — public platform packages

The current source uses the published SDK 0.21.0, Kit/native 0.21.0, App Tools 0.13.0, and Nimi Coding 0.6.5. Dependencies resolve directly from public registries without local archive overrides. Run `pnpm install --frozen-lockfile` to install the locked versions. Earlier release checks below apply only to their recorded dependency combinations.

## 0.1.9 · Recorded published platform dependencies

Uses public npm SDK 0.21.0, Kit/native 0.19.3, App Tools 0.12.1 and nimi-coding 0.6.5 with frozen registry lockfiles. Local Nimi tarball overrides are removed; Desktop-supervised development and installed Apps use the same published carrier.

# ParentOS 0.1.7

补充面向家长的受众、AI 文字输出及健康数据使用声明，供支持该字段的 Nimi 展示。保留 SDK 0.11 / Kit 0.7 配对；不新增业务能力或运行门禁。发行与 Catalog 准入独立进行，声明不构成安全认证。

# ParentOS 0.1.6

本次候选版本接入 Nimi App v2 发行信息协议：

- 随安装包提供应用图标、简介、使用说明、版本说明和许可证。
- 携带应用已声明的 App Access、能力需求与存储方式。
- 提供与包内同字节的信息资产，供 Nimi 在安装前展示应用信息。

此文件是当前源码候选的版本说明；正式发布与 Registry 审核是独立步骤。
