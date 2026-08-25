## 项目概述
MoeKoeMusic 移动端（iOS/Android 音乐播放器），基于 Expo/React Native + Tamagui。本次任务的核心目标：将应用 iOS 最低部署版本从 16.4 降到 15.1，并产出可用的 unsigned IPA。

## 技术栈
- Expo SDK 55（从 SDK 57 降级）—— SDK 55 是最后一个支持 iOS 15.1 的版本
- React Native 0.83.10 / React 19.2.0（SDK 55 官方锁定版本）
- Tamagui、expo-router、expo-audio、expo-image、expo-video
- 音乐识别走 `api` git submodule（KuGouMusicApi）

## 关键降级改动
1. **SDK 57 → 55**：所有 `expo-*` 包改为 `~55.0.0`，`react-native` 0.83.10，`react` 19.2.0
2. **原生依赖必须对齐 bundledNativeModules.json**（这是最容易忽略的踩坑）：
   - `react-native-screens` ~4.23.0（不是 4.11，4.11 的 modulemap 暴露 C++ 头导致 Swift 编译 `cstdint file not found`）
   - `react-native-gesture-handler` ~2.30.0（不是 3.x）
   - `react-native-reanimated` 4.2.1 + `react-native-worklets` 0.7.4（版本必须配对）
   - `react-native-safe-area-context` ~5.6.2
3. `app.json` 用 `expo-build-properties` 插件设 `ios.deploymentTarget: "15.1"`
4. `src/app/_layout.tsx`：主题相关改从 `@react-navigation/native` 导入
5. `src/app/recognize.tsx`：SDK 57 的 `useAudioStream` 换成 SDK 55 可用的 `useAudioRecorder` + CAF 解析
6. `babel.config.js`：加 `react-native-worklets/plugin`

## 构建方式（iOS）
- 通过 GitHub Actions 云构建（fork 仓库 `zhuweiliiin/MoeKoeMusic-Mobile`），工作流 `.github/workflows/release.yml`
- 触发：`workflow_dispatch`，产物为 unsigned IPA artifact
- **Xcode 版本：必须用 26（`/Applications/Xcode_26*.app`）**，不能用 16.4

## 关键踩坑
1. **Xcode 16.4 会报 `unknown attribute 'MainActor'`**：expo-modules-core 55.0.25 的 `SwiftUIHostingView.swift` 用了 `@MainActor` 继承列表语法（Swift 6.2 / Xcode 26 才支持），而不是并发问题。
2. **不要强制 `SWIFT_VERSION=5.0`**：会破坏 Swift 6 的 noncopyable/~Copyable 类型，报 `cannot find type in scope`。正确做法是保持 Swift 6 语言模式，必要时用 `SWIFT_STRICT_CONCURRENCY=minimal`。
3. **不要启用 `EXPO_USE_PRECOMPILED_MODULES=1`**：在 GitHub Actions 会卡在 `resolve-dsym-sourcemaps.js`（ExpoVideo dSYM）阶段。用源码编译 + Xcode 26。
4. 版本对齐是编译成功的前提：任何"升级依赖修复编译错误"都要先对照 SDK 55 的 bundledNativeModules.json，避免连环错误升级（如 reanimated 4.2.1 被误升到 4.3.0 导致 worklets 也要升 0.8.x）。