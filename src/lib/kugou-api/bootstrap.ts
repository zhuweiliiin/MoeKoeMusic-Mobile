import { Buffer } from 'buffer';

import { ensureDeviceSessionValues, resetDeviceSessionValues } from './device';
import { ensureSessionHydrated } from './session';

type RuntimeProcess = {
  env?: Record<string, string | undefined>;
};

export type KugouSourceMode = 'official' | 'lite';

// 默认概念版(lite);正式版由 setKugouPlatform 在 settings hydrate 后按用户选择覆盖。
let currentSourceMode: KugouSourceMode = 'lite';

function applyPlatformValue(): void {
  const runtimeGlobal = globalThis as { process?: RuntimeProcess };
  if (!runtimeGlobal.process) {
    runtimeGlobal.process = {
      env: Object.create(null) as Record<string, string | undefined>,
    };
  }

  const processRef = runtimeGlobal.process;
  processRef.env ??= Object.create(null) as Record<string, string | undefined>;
  // 正式版不写 platform,使 api/util 里 process.env.platform === 'lite' 判定为 false。
  processRef.env.platform = currentSourceMode === 'lite' ? 'lite' : undefined;
}

/**
 * 动态切换酷狗 API 音源:概念版(lite)/正式版(official)。
 * request.js 每次请求都读取 process.env.platform,故多数接口即时生效;
 * 少数在模块加载时固化 isLite/appid/clientver 的模块(如 login)对已缓存的模块需重启生效。
 */
export function setKugouPlatform(mode: KugouSourceMode): void {
  currentSourceMode = mode;
  applyPlatformValue();
}

export function getKugouPlatform(): KugouSourceMode {
  return currentSourceMode;
}

let runtimePreparationPromise: Promise<void> | null = null;

function installRuntimeGlobals(): void {
  if (!globalThis.Buffer) {
    globalThis.Buffer = Buffer;
  }

  applyPlatformValue();
}

async function prepareRuntime(): Promise<void> {
  installRuntimeGlobals();
  await ensureSessionHydrated();
  await ensureDeviceSessionValues();
}

export async function prepareKugouApiRuntime(): Promise<void> {
  if (!runtimePreparationPromise) {
    runtimePreparationPromise = prepareRuntime().catch((error) => {
      runtimePreparationPromise = null;
      throw error;
    });
  }

  await runtimePreparationPromise;
}

export function resetKugouApiRuntime(): void {
  runtimePreparationPromise = null;
  resetDeviceSessionValues();
}
