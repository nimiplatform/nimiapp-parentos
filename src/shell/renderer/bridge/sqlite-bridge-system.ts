import { invoke } from './shell-command.js';

export function setAppSetting(key: string, value: string, now: string) {
  return invoke<void>('set_app_setting', { key, value, now });
}

export function getAppSetting(key: string) {
  return invoke<string | null>('get_app_setting', { key });
}

export function dbInit(
  appAccountId: string | null,
  admittedReminderRuleIds: readonly string[],
) {
  return invoke<void>('db_init', {
    appAccountId,
    admittedReminderRuleIds: [...admittedReminderRuleIds],
  });
}
