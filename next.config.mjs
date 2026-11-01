/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
  serverExternalPackages: ["sharp"],
  poweredByHeader: false,
};
export default nextConfig;
