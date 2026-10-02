import crypto from 'node:crypto';

export interface AdminGuardConfig {
  configured: boolean;
  expectedKey: string;
}

export interface AdminAccessResult {
  ok: boolean;
  status: number;
  message: string;
}

export function readAdminGuardConfig(env: Record<string, string | undefined>): AdminGuardConfig {
  const expectedKey = (env.ADMIN_API_KEY || '').trim();
  return {
    configured: expectedKey.length > 0,
    expectedKey,
  };
}

export function decideAdminAccess(config: AdminGuardConfig, suppliedKey: string): AdminAccessResult {
  if (!config.configured) {
    return {
      ok: false,
      status: 503,
      message: 'Admin endpoint disabled: ADMIN_API_KEY is not configured on the server.',
    };
  }

  const supplied = (suppliedKey || '').trim();
  if (!supplied) {
    return {
      ok: false,
      status: 401,
      message: 'Unauthorized: Missing x-admin-api-key header.',
    };
  }

  const a = Buffer.from(supplied);
  const b = Buffer.from(config.expectedKey);

  if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
    return {
      ok: true,
      status: 200,
      message: 'Authorized',
    };
  }

  return {
    ok: false,
    status: 401,
    message: 'Unauthorized: Invalid x-admin-api-key.',
  };
}
