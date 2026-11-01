export const AREAS = [
  { id: "zamalek", nameEn: "Zamalek", nameAr: "الزمالك", governorate: "Cairo", lat: 30.0626, lng: 31.2197 },
  { id: "downtown", nameEn: "Downtown", nameAr: "وسط البلد", governorate: "Cairo", lat: 30.0478, lng: 31.2400 },
  { id: "garden-city", nameEn: "Garden City", nameAr: "جاردن سيتي", governorate: "Cairo", lat: 30.0365, lng: 31.2318 },
  { id: "maadi", nameEn: "Maadi", nameAr: "المعادي", governorate: "Cairo", lat: 29.9602, lng: 31.2569 },
  { id: "heliopolis", nameEn: "Heliopolis", nameAr: "مصر الجديدة", governorate: "Cairo", lat: 30.0911, lng: 31.3226 },
  { id: "nasr-city", nameEn: "Nasr City", nameAr: "مدينة نصر", governorate: "Cairo", lat: 30.0566, lng: 31.3301 },
  { id: "new-cairo", nameEn: "New Cairo", nameAr: "القاهرة الجديدة", governorate: "Cairo", lat: 30.0074, lng: 31.4913 },
  { id: "dokki", nameEn: "Dokki", nameAr: "الدقي", governorate: "Giza", lat: 30.0384, lng: 31.2117 },
  { id: "mohandessin", nameEn: "Mohandessin", nameAr: "المهندسين", governorate: "Giza", lat: 30.0566, lng: 31.2005 },
  { id: "pyramids", nameEn: "Pyramids & Haram", nameAr: "الأهرامات والهرم", governorate: "Giza", lat: 29.9870, lng: 31.1460 },
  { id: "sheikh-zayed", nameEn: "Sheikh Zayed", nameAr: "الشيخ زايد", governorate: "Giza", lat: 30.0444, lng: 30.9760 },
  { id: "october", nameEn: "6th of October", nameAr: "السادس من أكتوبر", governorate: "Giza", lat: 29.9285, lng: 30.9188 },
] as const;

export const LISTING_TYPES = ["apartment", "studio", "duplex", "penthouse", "villa", "room"] as const;
export const AMENITIES = [
  "wifi", "ac", "kitchen", "washer", "elevator", "parking", "pool", "balcony", "nile_view", "pyramids_view",
  "generator", "security", "workspace", "gym", "family_friendly", "pets_allowed", "tv", "heating",
] as const;
