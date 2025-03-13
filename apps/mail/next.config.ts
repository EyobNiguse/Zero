import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? {
            exclude: ["warn", "error"],
          }
        : undefined,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "mail0.io" },
      { protocol: "https", hostname: "0.email" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
  typescript: {
    // TODO: enforce types throwing errors on build
    ignoreBuildErrors: true,
  },
  eslint: {
    // TODO: enforce linting throwing errors on build
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  async redirects() {
    return [
      {
        source: "/settings",
        destination: "/settings/general",
        permanent: true,
      },
      {
        source: "/mail",
        destination: "/mail/inbox",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
