import { TrackingCategory } from "@coinbase/cookie-manager";

export type CookieCategory = "necessary" | "functional" | "analytics" | "marketing";

export interface CategoryInfo {
  name: string;
  description: string;
  required?: boolean;
  trackingCategory: TrackingCategory;
}

export const COOKIE_CATEGORIES: Record<CookieCategory, CategoryInfo> = {
  necessary: {
    name: "Strictly Necessary",
    description: "These cookies are essential for the website to function properly.",
    required: true,
    trackingCategory: TrackingCategory.NECESSARY,
  },
  functional: {
    name: "Functional",
    description: "These cookies enable personalized features and functionality.",
    trackingCategory: TrackingCategory.FUNCTIONAL,
  },
  analytics: {
    name: "Analytics",
    description: "These cookies help us understand how visitors interact with the website.",
    trackingCategory: TrackingCategory.PERFORMANCE,
  },
  marketing: {
    name: "Marketing",
    description: "These cookies are used to deliver relevant ads and marketing campaigns.",
    trackingCategory: TrackingCategory.TARGETING,
  },
};

export const COOKIE_CONSENT_KEY = "cookieConsent";
export const COOKIE_PREFERENCES_KEY = "cookiePreferences";
