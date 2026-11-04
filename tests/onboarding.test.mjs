import assert from 'node:assert/strict';
import test from 'node:test';
import { isDemoMode, shouldShowFirstRun } from '../src/shared/onboarding.ts';

test('只在检查完成、未配置且未完成首用时显示首用页', () => {
  const base = {
    providerCheckDone: true,
    hasConfiguredProvider: false,
    onboardingDone: false,
  };

  assert.equal(shouldShowFirstRun(base), true);
  assert.equal(
    shouldShowFirstRun({ ...base, hasConfiguredProvider: true }),
    false,
  );
  assert.equal(shouldShowFirstRun({ ...base, onboardingDone: true }), false);
  assert.equal(
    shouldShowFirstRun({ ...base, providerCheckDone: false }),
    false,
  );
});

test('检查完成且未配置时进入演示模式', () => {
  assert.equal(
    isDemoMode({ providerCheckDone: true, hasConfiguredProvider: false }),
    true,
  );
  assert.equal(
    isDemoMode({ providerCheckDone: true, hasConfiguredProvider: true }),
    false,
  );
  assert.equal(
    isDemoMode({ providerCheckDone: false, hasConfiguredProvider: false }),
    false,
  );
});
