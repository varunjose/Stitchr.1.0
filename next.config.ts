import type { NextConfig } from "next";
const config: NextConfig = {
  outputFileTracingRoot: __dirname,
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
  poweredByHeader: false,
};
export default config;
