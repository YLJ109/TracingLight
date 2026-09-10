import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 项目头像走同源 /uploads（<img>），B 站视频走 iframe，均不经过 next/image。
  // 为避免把 Next 图片层当成开放代理被滥用，白名单收紧到 B 站图片/视频 CDN 域名；
  // 如需新增外部图片源，请在此显式登记，不要退回 hostname:'*'。
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.hdslb.com', pathname: '/**' },
      { protocol: 'https', hostname: '**.bilibili.com', pathname: '/**' },
    ],
  },
  // 生产构建时保持 Node 原生加载，避免 webpack/turbopack 尝试打包原生模块（pdf-parse 依赖 fs）
  serverExternalPackages: ['pdf-parse'],
};

export default nextConfig;
