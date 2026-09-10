// 生成溯光比赛 PPT 的视觉资产：渐变背景 + 线条图标
// 幂等，可反复运行覆盖 assets/*.png
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = path.join(__dirname, 'assets');
fs.mkdirSync(OUT, { recursive: true });

const W = 1920, H = 1080;

// ---------- 渐变背景 ----------
// 深色墨蓝基底 + 极光(靛蓝→紫→青)斜向光带
function bgSVG(style) {
  const defs = `
    <defs>
      <radialGradient id="gA" cx="50%" cy="18%" r="80%">
        <stop offset="0%" stop-color="#2A3E78" stop-opacity="0.9"/>
        <stop offset="55%" stop-color="#141B38" stop-opacity="0.65"/>
        <stop offset="100%" stop-color="#0A0E1F" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="aurora" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#6366F1" stop-opacity="0.55"/>
        <stop offset="45%" stop-color="#8B5CF6" stop-opacity="0.38"/>
        <stop offset="100%" stop-color="#22D3EE" stop-opacity="0.42"/>
      </linearGradient>
      <linearGradient id="auroraRev" x1="100%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#22D3EE" stop-opacity="0.35"/>
        <stop offset="50%" stop-color="#8B5CF6" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="#6366F1" stop-opacity="0.45"/>
      </linearGradient>
    </defs>`;
  const base = `<rect width="${W}" height="${H}" fill="#0A0E1F"/>`;
  if (style === 'cover') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${defs}
      ${base}
      <rect width="${W}" height="${H}" fill="url(#gA)"/>
      <path d="M -120 ${H*0.9} C ${W*0.18} ${H*0.18}, ${W*0.7} ${H*0.92}, ${W+140} ${H*0.16} L ${W+140} ${H+60} L -120 ${H+60} Z" fill="url(#aurora)" opacity="0.9"/>
      <path d="M ${W*0.1} ${H+80} C ${W*0.62} ${H*0.42}, ${W*0.75} ${H*0.95}, ${W+160} ${H*0.5} L ${W+160} ${H+60} L ${W*0.1} ${H+60} Z" fill="url(#auroraRev)" opacity="0.5"/>
      </svg>`;
  }
  if (style === 'section') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${defs}
      ${base}
      <rect width="${W}" height="${H}" fill="url(#gA)"/>
      <path d="M -140 ${H*0.5} C ${W*0.32} ${H*0.66}, ${W*0.4} ${H*0.06}, ${W} ${H*0.34} L ${W} ${H} L -140 ${H} Z" fill="url(#aurora)" opacity="0.7"/>
      </svg>`;
  }
  if (style === 'content') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${defs}
      ${base}
      <rect width="${W}" height="${H}" fill="url(#gA)"/>
      </svg>`;
  }
  if (style === 'end') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${defs}
      ${base}
      <rect width="${W}" height="${H}" fill="url(#gA)"/>
      <circle cx="${W*0.5}" cy="${H*0.42}" r="${W*0.34}" fill="url(#aurora)" opacity="0.75"/>
      </svg>`;
  }
}

const bgs = { cover: 'cover-bg.png', section: 'section-bg.png', content: 'content-bg.png', end: 'end-bg.png' };
(async () => {
  for (const [style, file] of Object.entries(bgs)) {
    await sharp(Buffer.from(bgSVG(style))).resize(W, H).png().toFile(path.join(OUT, file));
    console.log('bg', file);
  }

  // ---------- 线条图标（stroke 白色，占位由调用方着色会不同：这里统一白 → 在 pptx 里放色圆底上）----------
  const icons = {
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10c.8.6 1 1.4 1 2h6c0-.6.2-1.4 1-2a6 6 0 0 0-4-10z"/>',
    scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M21 7V5a2 2 0 0 0-2-2h-2M3 17v2a2 2 0 0 0 2 2h2M21 17v2a2 2 0 0 1-2 2h-2M7 12l3 3 7-7"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
    radar: '<circle cx="12" cy="12" r="9"/><path d="M12 3v9l6.5 3.7M12 3a9 9 0 0 1 0 18"/>',
    network: '<circle cx="12" cy="5" r="2.4"/><circle cx="5" cy="18" r="2.4"/><circle cx="19" cy="18" r="2.4"/><path d="M10.5 7 6.5 15.8M13.5 7l4 8.8M7.5 18h9"/>',
    shield: '<path d="M12 3 4 6v6c0 4.5 3.4 7.8 8 9 4.6-1.2 8-4.5 8-9V6l-8-3z"/><path d="m9.2 12 2 2 3.6-4"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 0-2 2zM20 5a2 2 0 0 0-2-2h-5v18h5a2 2 0 0 1 2 2z"/>',
    chat: '<path d="M21 12a8 8 0 0 1-8 8H6l-3 3v-7a8 8 0 1 1 18-4z"/><path d="M8 10h8M8 14h5"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M21 20c0-2.6-1.2-4.5-3-5.3"/>',
    chart: '<path d="M4 20V4M4 20h16"/><rect x="7" y="12" width="3" height="6" rx="0.5"/><rect x="12" y="8" width="3" height="10" rx="0.5"/><rect x="17" y="5" width="3" height="13" rx="0.5"/>',
    gauge: '<path d="M4 19a8 8 0 1 1 16 0"/><path d="m12 13 4-4"/>',
    building: '<rect x="4" y="4" width="16" height="17" rx="1.5"/><path d="M9 21v-4h6v4M9 8h2M13 8h2M9 12h2M13 12h2"/>',
    grad: '<path d="M12 4 2 9l10 5 10-5-10-5z"/><path d="M6 11v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5M22 9v5"/>',
    rocket: '<path d="M12 15c-1-3-1-6 0-9l3-2c2 2 2 6 0 10"/><path d="M12 6c-2 3-3 6-3 9l3 2 3-2c0-3-1-6-3-9z"/><circle cx="13.5" cy="8.5" r="1.3"/><path d="M9 18l-3 2M10 21l-1-2"/>',
    code: '<path d="M8 6 3 12l5 6M16 6l5 6-5 6M14 4l-4 16"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3M12 15v2"/>',
    server: '<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><circle cx="7" cy="7" r="1"/><circle cx="7" cy="17" r="1"/><path d="M11 7h6M11 17h6"/>',
    spark: '<path d="M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4L12 3z"/><path d="M18 14l.7 2L21 16.7 19 17.4v2.2l-1.9.7L18.6 22H16l1.2 2.2-1.9.7L14 20.6M19 13l1.4 4 4 1.4-4 1.4L19 24"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    star: '<path d="M12 3l2.7 5.5 6 .9-4.3 4.2 1 6L12 17.2 6.6 19.6l1-6L3.3 9.4l6-.9L12 3z"/>',
    trend: '<path d="M3 17l6-6 4 4 8-9"/><path d="M15 6h6v6"/>',
    award: '<circle cx="12" cy="9" r="6"/><path d="M8.6 14 7 21l5-2.5L17 21l-1.6-7"/>',
    layers: '<path d="M12 3 2 8l10 5 10-5-10-5z"/><path d="M2 13l10 5 10-5M2 17l10 5 10-5"/>',
    brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-1 5.9A4 4 0 0 0 8 20h6a4 4 0 0 0 3-6.1A3 3 0 0 0 15 8a3 3 0 0 0-4-3c-.4.2-1 .2-2 0z"/>',
    check: '<path d="M4 12.5 9.5 18 20 6"/>',
  };
  const svgIcon = (d) => `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 24 24" fill="none" stroke="#EEF3FF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  for (const [name, d] of Object.entries(icons)) {
    await sharp(Buffer.from(svgIcon(d))).resize(160, 160).png().toFile(path.join(OUT, `icon-${name}.png`));
  }
  console.log('icons', Object.keys(icons).length);
})();