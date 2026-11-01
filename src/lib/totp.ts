import { createHmac, randomBytes } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Encode(buf: Buffer) {
  let bits = 0, value = 0, out = "";
  for (const b of buf) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string) {
  const clean = s.replace(/=+$/, "").toUpperCase();
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch); if (i < 0) continue;
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
export const newTotpSecret = () => base32Encode(randomBytes(20));

export function totpAt(secret: string, counter: number) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  const code = ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
  return code;
}
/** RFC 6238, 30 s steps, accepts ±1 step of clock drift. */
export function verifyTotp(secret: string, code: string, now = Date.now()) {
  const c = Math.floor(now / 30_000);
  return [-1, 0, 1].some((d) => totpAt(secret, c + d) === code.trim());
}
export const otpauthUrl = (secret: string, label: string) =>
  `otpauth://totp/Reliance:${encodeURIComponent(label)}?secret=${secret}&issuer=Reliance&digits=6&period=30`;
