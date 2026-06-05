import { invoke } from '@tauri-apps/api/core';
import type { NimiRuntimeAppStorageProjection } from '@nimiplatform/sdk/runtime';

export type ParentOSAppStorageProjectionInput = Pick<
  NimiRuntimeAppStorageProjection,
  'appId' | 'state' | 'storagePolicyRef' | 'durableDataRoot' | 'cacheRoot' | 'tempRoot'
>;

export type ParentOSStorageDirs = {
  parentosDataRoot: string;
  parentosCacheRoot: string;
  parentosTempRoot: string;
  parentosDbPath: string;
};

export function prepareParentOSAppStorage(projection: ParentOSAppStorageProjectionInput) {
  return invoke<ParentOSStorageDirs>('prepare_parentos_app_storage', { projection });
}

export function setAppSetting(key: string, value: string, now: string) {
  return invoke<void>('set_app_setting', { key, value, now });
}

export function getAppSetting(key: string) {
  return invoke<string | null>('get_app_setting', { key });
}

export function dbInit(subjectUserId?: string | null) {
  return invoke<void>('db_init', { subjectUserId: subjectUserId ?? null });
}
