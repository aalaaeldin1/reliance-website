/** Hamming distance between two 64-bit hashes written as 16 hex characters. */
export function hamming(a: string, b: string) {
  let x = BigInt("0x" + a) ^ BigInt("0x" + b), n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}
