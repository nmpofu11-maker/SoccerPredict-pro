const ADMIN_KEY_STORAGE = 'soccerpredict_admin_api_key_session';

export function setAdminApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  const clean = key.trim();
  if (clean) {
    sessionStorage.setItem(ADMIN_KEY_STORAGE, clean);
  } else {
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
  }
}

export function hasAdminApiKey(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(sessionStorage.getItem(ADMIN_KEY_STORAGE)?.trim());
}

export function getAdminApiKey(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem(ADMIN_KEY_STORAGE)?.trim() || '';
}

export function getAdminApiHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};

  const key = sessionStorage.getItem(ADMIN_KEY_STORAGE)?.trim() || '';
  return key ? { 'x-admin-api-key': key } : {};
}

export function clearAdminApiKey(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
  }
}

