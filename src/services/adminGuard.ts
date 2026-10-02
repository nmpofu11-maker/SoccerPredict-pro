import crypto from 'crypto';

export interface AdminGuardConfig {
  adminKey: string;
  allowOpen: boolean;
  production: boolean;
}

export type AdminAccessDecision =
  | { ok: true }
  | { ok: false; status: number; message: string };

/**
 * Reads admin guard configuration from the provided environment dictionary.
 */
export function readAdminGuardConfig(env: NodeJS.ProcessEnv = process.env): AdminGuardConfig {
  const adminKey = (env.ADMIN_API_KEY || '').trim();
  const allowOpen = env.ALLOW_OPEN_ADMIN === 'true';
  const production = env.NODE_ENV === 'production';
  return { adminKey, allowOpen, production };
}

/**
 * Determines whether access to administrative endpoints should be granted.
 * - If adminKey is not configured:
 *   - If allowOpen is true AND production is false: access is granted (dev override).
 *   - Otherwise: fails closed with 503 Service Unavailable.
 * - If adminKey is configured:
 *   - Compares supplied key with constant-time comparison.
 *   - Missing or incorrect key returns 401 Unauthorized.
 */
export function decideAdminAccess(
  cfg: AdminGuardConfig,
  suppliedKey?: string | string[]
): AdminAccessDecision {
  const keyToTest = typeof suppliedKey === 'string' ? suppliedKey.trim() : '';

  if (!cfg.adminKey) {
    if (cfg.allowOpen && !cfg.production) {
      return { ok: true };
    }
    return {
      ok: false,
      status: 503,
      message: 'Admin operations are currently unavailable. ADMIN_API_KEY is not configured on the server.',
    };
  }

  if (!keyToTest) {
    return {
      ok: false,
      status: 401,
      message: 'Administrative authorization required: x-admin-api-key header missing.',
    };
  }

  const expectedBuf = Buffer.from(cfg.adminKey, 'utf8');
  const suppliedBuf = Buffer.from(keyToTest, 'utf8');

  if (expectedBuf.length !== suppliedBuf.length) {
    return {
      ok: false,
      status: 401,
      message: 'Invalid administrative API key provided.',
    };
  }

  const matches = crypto.timingSafeEqual(expectedBuf, suppliedBuf);
  if (!matches) {
    return {
      ok: false,
      status: 401,
      message: 'Invalid administrative API key provided.',
    };
  }

  return { ok: true };
}
