/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: ".next-build",
  outputFileTracingRoot: process.cwd(),
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
