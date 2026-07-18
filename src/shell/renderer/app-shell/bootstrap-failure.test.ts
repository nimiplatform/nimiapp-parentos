import { describe, expect, it } from 'vitest';
import { classifyParentOSBootstrapFailure } from './bootstrap-failure.js';

describe('ParentOS app-data bootstrap failure classifier', () => {
  it('classifies a missing native app host as temporarily unavailable', () => {
    expect(classifyParentOSBootstrapFailure(Object.assign(new Error('sidecar missing'), {
      reasonCode: 'parentos-electron-sidecar-binary-unavailable',
      actionHint: 'build_parentos_host_sidecar_before_launching_electron',
    }))).toEqual({
      state: 'app-data-unavailable',
      reasonCode: 'parentos-electron-sidecar-binary-unavailable',
      actionHint: 'build_parentos_host_sidecar_before_launching_electron',
      message: 'sidecar missing',
    });
  });

  it('classifies malformed or migration failures as app-data repair failures', () => {
    expect(classifyParentOSBootstrapFailure(new Error(JSON.stringify({
      code: 'host-internal-error',
      reasonCode: 'parentos-sqlite-migration-failed',
      actionHint: 'repair_parentos_app_data',
    })))).toMatchObject({
      state: 'app-data-repair-required',
      reasonCode: 'parentos-sqlite-migration-failed',
      actionHint: 'repair_parentos_app_data',
    });
  });
});
