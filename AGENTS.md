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

## 播放器与收藏关键实现（后续改动务必保持）
- `src/features/player/store.ts`
  - `loadTrackAt` 用 `loadSequence` 竞态计数防"快速连点切歌"串音；`player.replace()` 必须 `await` 后再 `play()`，否则 play 可能仍作用在上一首 source 上（表现为"点下一首没换歌"）。`replace` 之后还要再校验一次 sequence。
  - `playTracks(tracks, startIndex)` 建立队列时先 `filter(hash)` 得到 playable；目标 hash 要从 `startIndex` 向后扫第一个非空 hash，否则 startIndex 处曲目无 hash 会退化成播 playable 第一首（"点 A 播 B"）。
- `src/features/library/library-api.ts` 的 `fetchPlaylistTrackRefs(gid)`：完整翻页拉取「我喜欢」全部 hash/fileid（原 4 页×300=1200 上限会导致超大歌单尾部红心不亮），终止条件用「本页不足满页 / refs 数量达 total / 满页却零有效条目」三重判断，200 页硬上限兜底防死循环。
- 底部播放栏 `src/components/ui/mini-player.tsx`、全屏 `src/app/player.tsx` 均有红心按钮（`useIsLiked` + `libraryActions.toggleLike`）；`useIsLiked` 依赖 liked map 完整。
- 清除缓存：`src/app/settings.tsx` 的「通用」分区，用 `expo-image` 的 `Image.clearDiskCache()` / `clearMemoryCache()`。**只清图片缓存**；歌曲为在线流式播放、不落本地缓存文件，因此不清歌曲缓存（弹窗文案已说明这一点），也不动登录态与歌单收藏。

## 本轮新增功能实现（后续改动务必保持）

### 进度条拖动 / 卡住（问题1）
- `src/features/player/store.ts` 的 `seekToMs`：先 `progressStore.setState({ positionMs: clamped })` 立即反馈，再 `const token = ++seekGeneration` + `await audioPlayer.seekTo(...)`，`finally` 里 `token === seekGeneration` 时清零。`handlePlaybackStatus` 里 `seekGeneration > 0` 时不覆盖 `positionMs`（只更新 durationMs/playing/buffering），否则原生 seek 过渡期的 stale `currentTime` 会把进度条顶回旧位置。
- `player.replace()` 必须 `await`；`src/app/player.tsx` 的进度 Slider 不再因 `durationMs=0` 禁用（避免时长未回传时整条卡死不可拖）。

### 音源切换（问题3）
- 设置页「音源」分区（`src/app/settings.tsx`）用 `SegmentedControl` 切「酷狗概念版(lite)/酷狗正式版(official)」，默认 `lite`。
- `src/features/settings/store.ts` 持久化 `sourceMode`，`hydrateSettings()` 和 `setSourceMode()` 里都会调用 `setKugouPlatform(sourceMode)`。
- `src/lib/kugou-api/bootstrap.ts` 的 `setKugouPlatform()` 动态写 `process.env.platform`（lite→`'lite'`，official→`undefined`）；`installRuntimeGlobals()` 不再硬编码。**注意**：`api/util/index.js` 的 `isLite/appid/clientver` 是模块加载时固化的常量，因此切换音源后需重启应用才能让 login 等模块完全生效；`api/util/request.js` 的 isLite 是请求时动态读的，切换后立即可用。
- 概念版 appid=3116/clientver=11440，正式版 appid=1005/clientver=20489（见 `api/util/config.json`）。

### 听歌自动领 VIP（问题3，仅概念版）
- `src/features/player/vip-claim.ts` 的 `maybeReportListenAndClaimVip(hash, mixsongid)`：非 lite 或未登录直接返回；每首歌 `hash` 只上报一次 `mobileApi.youth_listen_song({ mixsongid })`，每天（内存日期键）最多尝试一次 `mobileApi.youth_day_vip({ receive_day: 1 })`；全部 try/catch 静默，绝不阻断播放。在 `loadTrackAt` 播放成功后 `void` 触发。

### 锁屏上一首/下一首（问题2，框架限制）
- **expo-audio 55 做不到锁屏 prev/next**：`AudioPlayer`（单 player）的 `AudioLockScreenOptions` 只有 `showSeekForward/showSeekBackward`，没有 prev/next；`AudioPlaylist`（原生队列，才有 next/previous）是 expo-audio 56+ 才引入的 API，SDK 55 不存在。因此锁屏/控制中心只能显示「-10 秒、播放/暂停、+10 秒」。要真正支持需升级 expo-audio（连带 Expo SDK）或引入第三方原生模块（如 expo-media-control），风险较高，暂未做。

### 歌单 / 我喜欢 搜索（问题5）
- `src/app/playlist/[id].tsx`：`searchQuery` + `filteredTracks`（客户端按 title/artist/album 小写包含过滤）；`playFromTrack` 用 `state.tracks.findIndex(hash)` 找回真实索引再 `playFrom`，避免过滤后 index 错位。搜索框放在 ListHeader、播放全部按钮上方。

### 稳定性加固（问题7）
- `src/features/player/store.ts`：`handleTrackFinished` 先判 `queue.length===0` 直接返回（防 clearQueue 后收到延迟 didJustFinish 触发空 player seek/play），循环 play/seekTo 与 `toggle` 的 play/seekTo、`pause` 均加 try/catch，避免 expo-audio 原生层瞬时异常经事件回调抛出导致崩溃。