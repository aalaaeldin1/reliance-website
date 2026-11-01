// Hide contact details in guest↔host messages and spot requests to pay outside Reliance.
const ARABIC_DIGITS = /[٠-٩]/g;
const toLatin = (s: string) => s.replace(ARABIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660));

const PHONE = /(\+?\d[\d\s\-().]{7,}\d)/g;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL = /\b((https?:\/\/|www\.)\S+|\S+\.(com|net|org|eg|me|link|ly)(\/\S*)?)\b/gi;
const OFF_PLATFORM = [
  "instapay", "insta pay", "vodafone cash", "orange cash", "etisalat cash", "fawry", "whatsapp", "whats app",
  "telegram", "wire", "transfer to me", "pay me directly", "outside the app", "cash on arrival",
  "انستاباي", "انستا باي", "فودافون كاش", "واتساب", "واتس", "تليجرام", "تحويل", "ادفع لي", "كاش",
];

export function maskMessage(input: string): { text: string; masked: boolean; offPlatform: boolean } {
  const latin = toLatin(input);
  let masked = false;
  let text = latin
    .replace(EMAIL, () => ((masked = true), "[email hidden]"))
    .replace(URL, () => ((masked = true), "[link hidden]"))
    .replace(PHONE, (m) => (m.replace(/\D/g, "").length >= 8 ? ((masked = true), "[number hidden]") : m));
  const lower = latin.toLowerCase();
  const offPlatform = OFF_PLATFORM.some((k) => lower.includes(k));
  if (text.length > 2000) text = text.slice(0, 2000);
  return { text, masked, offPlatform };
}
