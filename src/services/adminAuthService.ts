const ADMIN_KEY_STORAGE = 'soccerpredict_admin_api_key_session';

export function getAdminApiHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};

  const key = sessionStorage.getItem(ADMIN_KEY_STORAGE) || '';
  return key ? { 'x-admin-api-key': key } : {};
}

export function promptForAdminApiKey(): string {
  if (typeof window === 'undefined') return '';
  const entered = window.prompt('Operator authorization required. Enter the server ADMIN_API_KEY:');
  if (entered) {
    const key = entered.trim();
    if (key) {
      sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
      return key;
    }
  }
  return '';
}

export function clearAdminApiKey(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
  }
}
