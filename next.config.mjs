/** @type {import('next').NextConfig} */
const nextConfig = {
  // @libsql/client uses native .node binaries — keep it external so Next.js
  // doesn't try to bundle it (bundling native modules breaks Vercel deployment)
  serverExternalPackages: ["@libsql/client"],
};

export default nextConfig;
