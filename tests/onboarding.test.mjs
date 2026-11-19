import assert from 'node:assert/strict';
import test from 'node:test';
import { isDemoMode, shouldShowFirstRun } from '../src/shared/onboarding.ts';

test('未配置模型且未显式选择演示时，始终显示首用引导页', () => {
  const base = {
    providerCheckDone: true,
    hasConfiguredProvider: false,
    demoRequested: false,
  };

  assert.equal(shouldShowFirstRun(base), true);
  assert.equal(
    shouldShowFirstRun({ ...base, hasConfiguredProvider: true }),
    false,
  );
  assert.equal(shouldShowFirstRun({ ...base, demoRequested: true }), false);
  assert.equal(
    shouldShowFirstRun({ ...base, providerCheckDone: false }),
    false,
  );
});

test('只有显式选择且未配置模型时才进入演示模式', () => {
  assert.equal(
    isDemoMode({
      providerCheckDone: true,
      hasConfiguredProvider: false,
      demoRequested: true,
    }),
    true,
  );
  assert.equal(
    isDemoMode({
      providerCheckDone: true,
      hasConfiguredProvider: false,
      demoRequested: false,
    }),
    false,
  );
  assert.equal(
    isDemoMode({
      providerCheckDone: true,
      hasConfiguredProvider: true,
      demoRequested: true,
    }),
    false,
  );
  assert.equal(
    isDemoMode({
      providerCheckDone: false,
      hasConfiguredProvider: false,
      demoRequested: true,
    }),
    false,
  );
});
