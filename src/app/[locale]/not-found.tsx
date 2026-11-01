import Link from "next/link";
export default function NotFound() {
  return <div className="wrap py-20 text-center"><h1 className="font-display text-5xl font-semibold">404</h1><p className="mt-2 text-muted">Page not found · الصفحة غير موجودة</p><Link href="/" className="btn-gold mt-6">Reliance</Link></div>;
}
