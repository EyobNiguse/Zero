"use client";

import { CookieCategory } from "./cookies";

interface CookieOptions {
  category: CookieCategory;
  maxAge?: number;
  path?: string;
}

const DEFAULT_OPTIONS = {
  path: "/",
  maxAge: 365 * 24 * 60 * 60, // 1 year
};

class CookieUtils {
  private static cookieRegistry: Map<string, CookieCategory> = new Map();

  static registerCookie(name: string, category: CookieCategory) {
    this.cookieRegistry.set(name, category);
  }

  static getCookieCategory(name: string): CookieCategory | undefined {
    return this.cookieRegistry.get(name);
  }

  static setCookie(name: string, value: string, options: CookieOptions) {
    this.registerCookie(name, options.category);

    const cookieOptions = {
      ...DEFAULT_OPTIONS,
      ...options,
    };

    const cookie = `${name}=${encodeURIComponent(value)}; Path=${
      cookieOptions.path
    }; Max-Age=${cookieOptions.maxAge}; SameSite=Lax${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`;

    document.cookie = cookie;
  }

  static getCookie(name: string): string | undefined {
    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const [cookieName, cookieValue] = cookie.split("=").map((c) => c.trim());
      if (cookieName === name) {
        return decodeURIComponent(cookieValue || "");
      }
    }
    return undefined;
  }

  static removeCookie(name: string) {
    document.cookie = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT`;
  }

  static getAllCookies(): { [key: string]: string } {
    return document.cookie.split(";").reduce(
      (acc, cookie) => {
        const [name, value] = cookie.split("=").map((c) => c.trim());
        if (name && value) {
          acc[name] = decodeURIComponent(value);
        }
        return acc;
      },
      {} as { [key: string]: string },
    );
  }

  static removeAllCookiesByCategory(category: CookieCategory) {
    const allCookies = this.getAllCookies();

    Object.keys(allCookies).forEach((cookieName) => {
      const cookieCategory = this.getCookieCategory(cookieName);
      if (cookieCategory === category) {
        this.removeCookie(cookieName);
      }
    });
  }

  static cleanupRejectedCookies(acceptedCategories: CookieCategory[]) {
    const allCookies = this.getAllCookies();

    Object.keys(allCookies).forEach((cookieName) => {
      const category = this.getCookieCategory(cookieName);
      if (category && !acceptedCategories.includes(category)) {
        this.removeCookie(cookieName);
      }
    });
  }
}

export default CookieUtils;
