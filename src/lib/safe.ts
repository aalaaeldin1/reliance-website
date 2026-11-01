import "server-only";
import { decrypt, maskAccount } from "./crypto";
/** Shows only the last 4 characters of an encrypted payout account. */
export function decryptSafe(enc: string) {
  try { return maskAccount(decrypt(enc)); } catch { return "••••"; }
}
export function decryptFull(enc: string) {
  try { return decrypt(enc); } catch { return ""; }
}
