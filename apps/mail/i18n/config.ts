export type Locale = (typeof locales)[number];

export const availableLocales = [
  {
    code: "en",
    name: "English",
  },
  {
    code: "fr",
    name: "French",
  },
  {
    code: "tr",
    name: "Turkish",
  },
  {
    code: "es-ES",
    name: "Spanish",
  },
];

export const locales = availableLocales.map((locale) => locale.code);
export const defaultLocale: Locale = "en";
