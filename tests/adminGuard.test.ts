import test from 'node:test';
import assert from 'node:assert/strict';
import { readAdminGuardConfig, decideAdminAccess } from '../src/services/adminGuard';

test('adminGuard: unset key gives 503 by default', () => {
  const cfg = readAdminGuardConfig({ ADMIN_API_KEY: '', ALLOW_OPEN_ADMIN: 'false', NODE_ENV: 'development' });
  const decision = decideAdminAccess(cfg, 'some-key');
  assert.equal(decision.ok, false);
  if (!decision.ok) {
    assert.equal(decision.status, 503);
    assert.match(decision.message, /ADMIN_API_KEY is not configured/);
  }
});

test('adminGuard: ALLOW_OPEN_ADMIN works outside production', () => {
  const cfg = readAdminGuardConfig({ ADMIN_API_KEY: '', ALLOW_OPEN_ADMIN: 'true', NODE_ENV: 'development' });
  const decision = decideAdminAccess(cfg, undefined);
  assert.equal(decision.ok, true);
});

test('adminGuard: ALLOW_OPEN_ADMIN fails closed in production', () => {
  const cfg = readAdminGuardConfig({ ADMIN_API_KEY: '', ALLOW_OPEN_ADMIN: 'true', NODE_ENV: 'production' });
  const decision = decideAdminAccess(cfg, undefined);
  assert.equal(decision.ok, false);
  if (!decision.ok) {
    assert.equal(decision.status, 503);
  }
});

test('adminGuard: missing or wrong key gives 401 when ADMIN_API_KEY is set', () => {
  const cfg = readAdminGuardConfig({ ADMIN_API_KEY: 'secret-operator-pass-123', ALLOW_OPEN_ADMIN: 'false', NODE_ENV: 'production' });
  
  // Missing key
  const missing = decideAdminAccess(cfg, undefined);
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.status, 401);
  }

  // Wrong key (different length)
  const wrongLen = decideAdminAccess(cfg, 'wrong');
  assert.equal(wrongLen.ok, false);
  if (!wrongLen.ok) {
    assert.equal(wrongLen.status, 401);
  }

  // Wrong key (same length)
  const wrongVal = decideAdminAccess(cfg, 'secret-operator-pass-999');
  assert.equal(wrongVal.ok, false);
  if (!wrongVal.ok) {
    assert.equal(wrongVal.status, 401);
  }
});

test('adminGuard: correct key passes', () => {
  const cfg = readAdminGuardConfig({ ADMIN_API_KEY: 'secret-operator-pass-123', ALLOW_OPEN_ADMIN: 'false', NODE_ENV: 'production' });
  const decision = decideAdminAccess(cfg, 'secret-operator-pass-123');
  assert.equal(decision.ok, true);
});
