import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Production: do NOT ignore build errors — fail fast on type issues
  typescript: {
    ignoreBuildErrors: false,
  },
  // Compress responses
  compress: true,
  // Powered-by header removal for security
  poweredByHeader: false,
  // Image optimization
  images: {
    formats: ["image/avif", "image/webp"],
  },
  // Experimental: optimize package imports
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
      "recharts",
    ],
  },
};

export default nextConfig;
