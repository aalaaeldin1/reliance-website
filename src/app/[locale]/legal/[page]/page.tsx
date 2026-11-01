import { notFound } from "next/navigation";
import { pageCtx } from "@/lib/page";
import { Notice } from "@/components/ui";

// Placeholder legal pages. Have an Egyptian lawyer write the final text before launch.
const PAGES = {
  terms: {
    en: ["Terms of service", ["Reliance connects guests with verified hosts in Cairo and Giza. Guests pay Reliance; Reliance pays the host 24 hours after check-in, minus a 5% host fee. Guests pay a 7% service fee.", "Every adult guest must show a valid ID at check-in. Hosts must register guests with the authorities as Egyptian law requires.", "Cancellations follow the policy shown on the listing at the time of booking. Payments outside Reliance are not protected."]],
    ar: ["شروط الاستخدام", ["تربط Reliance الضيوف بمضيفين موثقين في القاهرة والجيزة. يدفع الضيف لـ Reliance، وتحوّل Reliance للمضيف بعد 24 ساعة من الوصول بعد خصم 5%. يدفع الضيف رسوم خدمة 7%.", "يجب على كل ضيف بالغ تقديم هوية سارية عند الوصول. يلتزم المضيف بتسجيل الضيوف لدى الجهات المختصة وفق القانون المصري.", "يخضع الإلغاء للسياسة الظاهرة على الإعلان وقت الحجز. المدفوعات خارج Reliance غير محمية."]],
  },
  privacy: {
    en: ["Privacy", ["We collect your phone number, name, ID documents and booking details to run bookings, verify identities and meet legal duties.", "ID images and payout accounts are encrypted and visible only to the Reliance verification and finance teams. Every view is logged.", "You can ask us to download or delete your data. Some records must be kept for tax and legal reasons."]],
    ar: ["الخصوصية", ["نجمع رقم هاتفك واسمك ومستندات هويتك وبيانات الحجز لإدارة الحجوزات والتحقق من الهوية والوفاء بالالتزامات القانونية.", "صور الهوية وحسابات التحويل مشفرة ولا يراها إلا فريقا التحقق والمالية في Reliance، ويُسجل كل اطلاع عليها.", "يمكنك طلب تنزيل بياناتك أو حذفها. بعض السجلات يجب الاحتفاظ بها لأسباب ضريبية وقانونية."]],
  },
  help: {
    en: ["Help", ["Booking questions: open your trip and send a message, or use “Report a problem” during your stay.", "Hosts: your dashboard shows verification status, requests and payouts.", "Never send money by InstaPay, wallet or cash directly to a host. Pay only through your Reliance trip page."]],
    ar: ["المساعدة", ["أسئلة الحجز: افتح رحلتك وأرسل رسالة، أو استخدم «أبلغ عن مشكلة» أثناء الإقامة.", "المضيفون: تعرض لوحتك حالة التحقق والطلبات والتحويلات.", "لا ترسل أموالًا عبر إنستاباي أو المحفظة أو نقدًا للمضيف مباشرة. ادفع فقط من صفحة رحلتك على Reliance."]],
  },
} as const;

export default async function Legal({ params }: { params: Promise<{ locale: string; page: string }> }) {
  const { l } = await pageCtx(params);
  const { page } = await params;
  const p = PAGES[page as keyof typeof PAGES];
  if (!p) notFound();
  const [title, paras] = p[l];
  return (
    <div className="wrap max-w-3xl space-y-4 py-10">
      <h1 className="font-display text-4xl font-semibold">{title}</h1>
      {page !== "help" && <Notice tone="warn">{l === "ar" ? "مسودة — يجب أن يراجعها محامٍ مصري قبل الإطلاق." : "Draft. To be reviewed by an Egyptian lawyer before launch."}</Notice>}
      {paras.map((x, i) => <p key={i} className="max-w-[65ch]">{x}</p>)}
    </div>
  );
}
