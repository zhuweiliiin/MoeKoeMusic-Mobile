import { useSyncExternalStore } from 'react';

import { DEFAULT_ACCENT_ID, isAccentPresetId, type AccentPresetId } from '@/constants/accents';
import { setKugouPlatform } from '@/lib/kugou-api/bootstrap';

import { readStoredAppearance, writeStoredAppearance } from './storage';

export type ThemeMode = 'system' | 'light' | 'dark';
export type SourceMode = 'official' | 'lite';

export type SettingsState = {
  hydrated: boolean;
  themeMode: ThemeMode;
  accentId: AccentPresetId;
  sourceMode: SourceMode;
};

const INITIAL_SETTINGS_STATE: SettingsState = {
  hydrated: false,
  themeMode: 'system',
  accentId: DEFAULT_ACCENT_ID,
  sourceMode: 'lite',
};

function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    getInitialState: () => initial,
    setState(partial: Partial<T>) {
      let changed = false;
      for (const key of Object.keys(partial) as (keyof T)[]) {
        if (!Object.is(state[key], partial[key])) {
          changed = true;
          break;
        }
      }

      if (!changed) {
        return;
      }

      state = { ...state, ...partial };
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const settingsStore = createStore(INITIAL_SETTINGS_STATE);

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

function isSourceMode(value: unknown): value is SourceMode {
  return value === 'official' || value === 'lite';
}

let hydrationPromise: Promise<void> | null = null;

/** 在根布局模块作用域调用一次;UI 由 hydrated 门控,不存在与用户操作的竞态。 */
export function hydrateSettings(): Promise<void> {
  if (!hydrationPromise) {
    hydrationPromise = (async () => {
      const stored = await readStoredAppearance();
      const sourceMode: SourceMode =
        stored && isSourceMode(stored.sourceMode) ? stored.sourceMode : 'lite';
      settingsStore.setState({
        themeMode: stored && isThemeMode(stored.themeMode) ? stored.themeMode : 'system',
        accentId: stored && isAccentPresetId(stored.accentId) ? stored.accentId : DEFAULT_ACCENT_ID,
        sourceMode,
        hydrated: true,
      });
      // 在任何 API 调用前按用户选择落地酷狗音源环境变量(默认概念版)。
      setKugouPlatform(sourceMode);
    })().catch(() => {
      const sourceMode = INITIAL_SETTINGS_STATE.sourceMode;
      setKugouPlatform(sourceMode);
      settingsStore.setState({ hydrated: true });
    });
  }
  return hydrationPromise;
}

function persist() {
  const { themeMode, accentId, sourceMode } = settingsStore.getState();
  void writeStoredAppearance({ themeMode, accentId, sourceMode });
}

export const settingsActions = {
  setThemeMode(themeMode: ThemeMode) {
    settingsStore.setState({ themeMode });
    persist();
  },
  setAccentId(accentId: AccentPresetId) {
    settingsStore.setState({ accentId });
    persist();
  },
  setSourceMode(sourceMode: SourceMode) {
    settingsStore.setState({ sourceMode });
    persist();
    // 立即切换环境变量,使 request.js 等动态读取 platform 的接口即时生效;
    // 已缓存的模块(login 等)在重启后完全生效。
    setKugouPlatform(sourceMode);
  },
};

export function useSettings(): SettingsState {
  return useSyncExternalStore(
    settingsStore.subscribe,
    settingsStore.getState,
    settingsStore.getInitialState
  );
}

export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(
    settingsStore.subscribe,
    () => settingsStore.getState().themeMode,
    () => INITIAL_SETTINGS_STATE.themeMode
  );
}

export function useAccentId(): AccentPresetId {
  return useSyncExternalStore(
    settingsStore.subscribe,
    () => settingsStore.getState().accentId,
    () => INITIAL_SETTINGS_STATE.accentId
  );
}

export function useSourceMode(): SourceMode {
  return useSyncExternalStore(
    settingsStore.subscribe,
    () => settingsStore.getState().sourceMode,
    () => INITIAL_SETTINGS_STATE.sourceMode
  );
}

export function useSettingsHydrated(): boolean {
  return useSyncExternalStore(
    settingsStore.subscribe,
    () => settingsStore.getState().hydrated,
    () => INITIAL_SETTINGS_STATE.hydrated
  );
}
