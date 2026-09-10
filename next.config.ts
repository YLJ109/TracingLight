import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        pathname: '/**',
      },
    ],
  },
  // 生产构建时保持 Node 原生加载，避免 webpack/turbopack 尝试打包原生模块（pdf-parse 依赖 fs）
  serverExternalPackages: ['pdf-parse'],
};

export default nextConfig;
