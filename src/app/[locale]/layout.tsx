import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import "../globals.css";
import { dirOf, getDict, isLocale } from "@/lib/i18n";
import { getCurrent } from "@/lib/auth";
import { Header, Footer } from "@/components/Header";

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#06101F" };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const ar = locale === "ar";
  return {
    title: { default: ar ? "Reliance | بيوت موثقة في القاهرة والجيزة" : "Reliance | Verified homes in Cairo & Giza", template: "%s | Reliance" },
    description: ar ? "احجز بيوتًا وشققًا موثقة في القاهرة والجيزة بأسعار عادلة بالجنيه المصري." : "Book verified homes and apartments in Cairo and Giza at fair prices in Egyptian pounds.",
    alternates: { languages: { en: "/en", ar: "/ar" } },
  };
}

export default async function RootLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDict(locale);
  const cur = await getCurrent();
  return (
    <html lang={locale} dir={dirOf(locale)} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Inter:wght@400;500;600;700&family=Cairo:wght@400;500;600;700&family=Noto+Naskh+Arabic:wght@500;600;700&display=swap" />
      </head>
      <body className="flex min-h-screen flex-col">
        <a href="#main" className="sr-only focus:not-sr-only">Skip to content</a>
        <Header l={locale} t={t} user={cur?.user ?? null} />
        <main id="main" className="flex-1">{children}</main>
        <Footer l={locale} t={t} />
      </body>
    </html>
  );
}
