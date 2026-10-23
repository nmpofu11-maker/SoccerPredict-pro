/** Automatic settlement can be disabled while inspecting fixtures and providers. */
export function isAutoSettlementEnabled(value: string | undefined): boolean {
  if (value === undefined || value.trim() === '') return true;
  return !['false', '0', 'no', 'off'].includes(value.trim().toLowerCase());
}
