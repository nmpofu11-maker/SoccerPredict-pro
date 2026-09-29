const ADMIN_KEY_STORAGE = 'soccerpredict_admin_api_key_session';

export function getAdminApiHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};

  let key = sessionStorage.getItem(ADMIN_KEY_STORAGE) || '';
  if (!key) {
    const entered = window.prompt('Operator authorization required. Enter the server ADMIN_API_KEY:');
    if (entered) {
      key = entered.trim();
      if (key) sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
    }
  }

  if (!key) {
    throw new Error('Operator authorization required.');
  }

  return { 'x-admin-api-key': key };
}

export function clearAdminApiKey(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
  }
}
