/**
 * 学习材料 · 在线视频内嵌
 * 识别三类可直接播放的视频链接（不跳转）：
 *   - 哔哩哔哩（bilibili.com/video/BV.. / 裸 BV.. / b23.tv）→ 官方外链播放器 iframe
 *   - 通用直链视频（mp4 / webm / m3u8 等）→ <video>
 *   - YouTube → 官方 embed iframe
 * 无法识别的超链接返回 null，由前端兜底为「新标签页观看」。
 */

export interface VideoEmbed {
  kind: 'bilibili' | 'native' | 'youtube';
  /** 内嵌播放地址 */
  src: string;
  /** 站外完整观看地址 */
  externalUrl: string;
}

const BILI_BV = /BV[0-9A-Za-z]{10}/;
const NATIVE_EXT = ['mp4', 'webm', 'ogg', 'ogv', 'm4v', 'mov', 'm3u8'];
const YT_RE = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([0-9A-Za-z_-]{6,})/;

export function resolveVideoEmbed(raw?: string | null): VideoEmbed | null {
  const url = (raw || '').trim();
  if (!url) return null;

  // 哔哩哔哩：优先按 BV 号匹配（链接或裸 BV 均可）
  const bv = url.match(BILI_BV);
  if (bv) {
    const id = bv[0];
    return {
      kind: 'bilibili',
      src: `https://player.bilibili.com/player.html?isOutside=true&bvid=${id}&page=1&high_quality=1&autoplay=0&danmaku=0`,
      externalUrl: `https://www.bilibili.com/video/${id}`,
    };
  }

  // YouTube
  const yt = url.match(YT_RE);
  if (yt) {
    return {
      kind: 'youtube',
      src: `https://www.youtube.com/embed/${yt[1]}`,
      externalUrl: url,
    };
  }

  // 通用直链视频
  const lower = url.toLowerCase();
  if (NATIVE_EXT.some((ext) => lower.includes(`.${ext}`)) || lower.startsWith('data:video/')) {
    return { kind: 'native', src: url, externalUrl: url };
  }

  return null;
}

/** 判断是否为可内嵌播放的视频材料 */
export function isVideoPlayable(type: string, url?: string | null): boolean {
  return type === 'video' && !!resolveVideoEmbed(url);
}