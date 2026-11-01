import { redirect } from "next/navigation";
import { pageCtx } from "@/lib/page";
import { OtpForm } from "@/components/OtpForm";

export default async function SignIn({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ next?: string }> }) {
  const { l, t, cur } = await pageCtx(params);
  const { next } = await searchParams;
  if (cur?.user.name) redirect(next?.startsWith(`/${l}`) ? next : `/${l}`);
  return (
    <div className="wrap max-w-md py-14">
      <h1 className="font-display text-4xl font-semibold">{t.auth.title}</h1>
      <p className="mb-6 mt-2 text-muted">{t.auth.lead}</p>
      <div className="card p-6"><OtpForm locale={l} next={next} t={t.auth} /></div>
    </div>
  );
}
