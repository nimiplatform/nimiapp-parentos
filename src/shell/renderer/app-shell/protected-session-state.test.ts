import { describe, expect, it } from 'vitest';
import { classifyParentOSProtectedSessionFailure } from './protected-session-state.js';

describe('ParentOS protected-session failure classifier', () => {
  it.each([
    ['account-authentication-required', 'login-required'],
    ['runtime-service-unavailable', 'runtime-unavailable'],
    ['runtime-permission-denied', 'permission-denied'],
    ['runtime-service-repair-required', 'repair-required'],
    ['parentos-protected-operation-set-not-admitted', 'capability-unavailable'],
  ] as const)('maps %s to %s', (reasonCode, state) => {
    expect(classifyParentOSProtectedSessionFailure(Object.assign(new Error(reasonCode), {
      reasonCode,
      actionHint: `act-${reasonCode}`,
    }))).toEqual({
      state,
      reasonCode,
      actionHint: `act-${reasonCode}`,
      message: reasonCode,
    });
  });

  it('extracts structured native failures without treating their message as success', () => {
    expect(classifyParentOSProtectedSessionFailure(new Error(JSON.stringify({
      code: 'runtime-service-untrusted',
      reasonCode: 'runtime-service-untrusted',
      actionHint: 'repair_verified_runtime_service',
    })))).toMatchObject({
      state: 'repair-required',
      reasonCode: 'runtime-service-untrusted',
      actionHint: 'repair_verified_runtime_service',
    });
  });
});
