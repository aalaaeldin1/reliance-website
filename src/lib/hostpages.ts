import "server-only";
import type { Dict, Locale } from "./i18n";
import { AREAS } from "./areas";
import { areaName } from "./i18n";

export function wizardProps(l: Locale, t: Dict) {
  return {
    types: t.types as unknown as Record<string, string>,
    amenities: t.amenities as unknown as Record<string, string>,
    areas: AREAS.map((a) => ({ id: a.id, name: `${areaName(a, l)} · ${l === "ar" ? (a.governorate === "Cairo" ? "القاهرة" : "الجيزة") : a.governorate}` })),
    policies: { flexible: t.policies.flexible, moderate: t.policies.moderate, firm: t.policies.firm },
    errors: { invalid: l === "ar" ? "راجع الحقول المحددة." : "Check the highlighted fields.", profile: t.host.become, not_found: t.errors.notFound },
  };
}
