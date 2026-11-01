import "server-only";
import { notFound } from "next/navigation";
import { getDict, isLocale, type Locale } from "./i18n";
import { getCurrent } from "./auth";

export type LP = { params: Promise<{ locale: string }> };

/** Resolve the locale, dictionary and signed-in user for a page. */
export async function pageCtx(params: Promise<{ locale: string }>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const l = locale as Locale;
  return { l, t: getDict(l), cur: await getCurrent() };
}
