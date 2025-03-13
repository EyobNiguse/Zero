import { getRequestConfig } from "next-intl/server";
import { getLocale } from "./utils";
import deepmerge from "deepmerge";

export default getRequestConfig(async () => {
  const locale = await getLocale();

  const userMessages = (await import(`../locales/${locale}.json`)).default;
  const defaultMessages = (await import(`../locales/en.json`)).default;
  const messages = deepmerge(defaultMessages, userMessages);

  return {
    locale,
    messages,
  };
});
