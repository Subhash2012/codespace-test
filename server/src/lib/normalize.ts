export function normalizePhone(input: string): string {
  return input.replace(/\D/g, '').trim();
}

export function normalizePhoneForSearch(input: string): string {
  return normalizePhone(input);
}
