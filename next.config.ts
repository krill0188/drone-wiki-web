import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    WIKI_PATH: process.env.WIKI_PATH || `${process.env.HOME}/2nd`,
  },
  serverExternalPackages: ["gray-matter", "remark", "remark-gfm", "remark-html"],
};

export default nextConfig;
