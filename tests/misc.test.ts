import { describe, expect, it } from "vitest";
import { maskMessage } from "@/lib/masking";
import { hamming } from "@/lib/phash";
import { totpAt, verifyTotp, base32Encode, base32Decode } from "@/lib/totp";
import { dictionaries } from "@/lib/i18n";

describe("maskMessage", () => {
  it("hides phone numbers in Latin and Arabic digits, emails and links", () => {
    const m = maskMessage("call 01012345678 or ٠١٠١٢٣٤٥٦٧٨, mail a@b.com, see www.x.com");
    expect(m.text).not.toMatch(/0101|@b\.com|www\./);
    expect(m.masked).toBe(true);
  });
  it("keeps normal numbers like guest counts and dates", () => {
    expect(maskMessage("We are 4 people arriving on the 12th").text).toBe("We are 4 people arriving on the 12th");
  });
  it("flags requests to pay outside Reliance", () => {
    expect(maskMessage("send it on instapay please").offPlatform).toBe(true);
    expect(maskMessage("ممكن واتساب؟").offPlatform).toBe(true);
    expect(maskMessage("What time is check-in?").offPlatform).toBe(false);
  });
});

describe("hashes and codes", () => {
  it("measures hamming distance", () => {
    expect(hamming("0000000000000000", "000000000000000f")).toBe(4);
  });
  it("matches the RFC 6238 test vector", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
    expect(totpAt(secret, Math.floor(59 / 30))).toBe("287082");
    expect(verifyTotp(secret, "287082", 59_000)).toBe(true);
  });
});

describe("i18n", () => {
  const keys = (o: object, p = ""): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? keys(v, p + k + ".") : [p + k]));
  it("has every key in both languages", () => {
    expect(keys(dictionaries.ar).sort()).toEqual(keys(dictionaries.en).sort());
  });
});
