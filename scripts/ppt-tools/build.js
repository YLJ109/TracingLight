// 溯光 TracingLight · 参赛路演 PPT（14页，WIDE 16:9）
// 运行：node build.js
const pptxgen = require('pptxgenjs');
const path = require('path');

const A = path.join(__dirname, 'assets');
const img = (f) => path.join(A, f);

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';          // 13.333 x 7.5
pres.author = 'TracingLight';
pres.title = '溯光 TracingLight · 高校智慧教育 AI 平台';

const W = 13.333, H = 7.5, M = 0.62;

// ---- 设计令牌 ----
const INK = '0A0E1F';
const GLASS = '1B2440';      // 玻璃卡片底
const GLASS_LINE = '3E4E85';
const TEXT = 'EEF3FF';
const SUB = 'A9B6D9';
const MUTE = '7C88AC';
const INDIGO = '5B6AF0', CYAN = '2BD3EE', VIOLET = '9B7AF2', GOLD = 'F3C877', CORAL = 'F97B6C', MINT = '4CD9A9';
const F_HEAD = 'Microsoft YaHei', F_BODY = 'Microsoft YaHei', F_NUM = 'Arial';

const makeShadow = (opacity = 0.32, blur = 14, offset = 5) => ({
  type: 'outer', color: '000000', blur, offset, angle: 105, opacity,
});

// ---- 工具函数 ----
function addBg(slide, file) {
  slide.background = { path: img(file) };
}
function glass(slide, x, y, w, h, o = {}) {
  return slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h,
    rectRadius: o.radius ?? 0.09,
    fill: { color: o.fill || GLASS, transparency: o.fillT ?? 22 },
    line: { color: o.line || GLASS_LINE, width: o.lineW ?? 0.9 },
    shadow: makeShadow(o.shadowO ?? 0.34, o.shadowB ?? 16, o.shadowF ?? 5),
  });
}
function iconCircle(slide, icon, x, y, d, color, ring = true) {
  slide.addShape(pres.shapes.OVAL, {
    x, y, w: d, h: d,
    fill: { color, transparency: ring ? 20 : 0 },
    line: { color, width: 0 },
    shadow: makeShadow(0.4, 12, 3),
  });
  slide.addImage({ path: img(`icon-${icon}.png`), x: x + d * 0.22, y: y + d * 0.22, w: d * 0.56, h: d * 0.56 });
}
function header(slide, icon, title, en, accent = INDIGO) {
  const iconY = M + 0.05;
  iconCircle(slide, icon, M, iconY, 0.5, accent);
  slide.addText(title, { x: M + 0.68, y: M - 0.06, w: 10, h: 0.55, fontFace: F_HEAD, fontSize: 27, bold: true, color: TEXT, margin: 0, valign: 'middle' });
  slide.addText(en, { x: M + 0.7, y: M + 0.46, w: 10, h: 0.3, fontFace: F_BODY, fontSize: 10.5, color: MUTE, charSpacing: 3, margin: 0, valign: 'top' });
}
function sectionTitle(slide, title, en) {
  slide.addText(title, { x: W / 2, y: 3.0, w: 8, h: 1.1, align: 'center', fontFace: F_HEAD, fontSize: 44, bold: true, color: TEXT, margin: 0 });
  slide.addText(en, { x: W / 2, y: 4.1, w: 8, h: 0.5, align: 'center', fontFace: F_BODY, fontSize: 13, color: SUB, charSpacing: 4, margin: 0 });
}
function subSlide(slide, text, x, w) {
  slide.addText(text, { x, y: H - 0.42, w, h: 0.28, fontFace: F_BODY, fontSize: 8.5, color: MUTE, margin: 0 });
}
function bullets(slide, x, y, w, items, opts = {}) {
  slide.addText(items.map((t, i) => ({ text: t, options: { bullet: { code: '2022' }, color: SUB, breakLine: i < items.length - 1, paraSpaceAfter: 7 } })),
    { x, y, w, h: opts.h || 3, fontFace: F_BODY, fontSize: opts.size || 13.5, lineSpacingMultiple: 1.15, margin: 0 });
}
function statBig(slide, x, y, w, value, label, accent = GOLD) {
  slide.addText(value, { x, y, w, h: 0.85, fontFace: F_NUM, fontSize: 40, bold: true, color: accent, margin: 0, valign: 'bottom' });
  slide.addText(label, { x, y: y + 0.88, w, h: 0.4, fontFace: F_BODY, fontSize: 12, color: SUB, margin: 0 });
}
function cardTitle(slide, x, y, w, text, accent, icon, iconX) {
  const d = 0.34;
  if (icon) iconCircle(slide, icon, iconX ?? x, y - 0.06, d, accent);
  slide.addText(text, { x: (icon ? (iconX ?? x) + d + 0.12 : x), y: y - 0.05, w: w - (icon ? d + 0.12 : 0), h: 0.4, fontFace: F_HEAD, fontSize: 15, bold: true, color: TEXT, margin: 0, valign: 'middle' });
}

// =========================================================
// S1 · 封面
// =========================================================
let s = pres.addSlide();
addBg(s, 'cover-bg.png');
// 顶部小徽章
s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: M, y: 0.62, w: 4.1, h: 0.46, rectRadius: 0.23, fill: { color: GLASS, transparency: 10 }, line: { color: GLASS_LINE, width: 0.8 } });
s.addText('高校智慧教育 AI 平台 · 创新创业大赛', { x: M, y: 0.7, w: 4.1, h: 0.3, align: 'center', fontFace: F_BODY, fontSize: 11.5, color: SUB, margin: 0 });
iconCircle(s, 'spark', W - 2.0, H - 1.9, 1.0, VIOLET);
// 主标题（左上暗区，浅色文字）
s.addText('溯 光', { x: M, y: 2.0, w: 8, h: 1.5, fontFace: F_HEAD, fontSize: 76, bold: true, color: TEXT, margin: 0, charSpacing: 2 });
s.addText('T R A C I N G · L I G H T', { x: M + 0.06, y: 3.55, w: 7, h: 0.4, fontFace: F_BODY, fontSize: 14, color: CYAN, charSpacing: 6, margin: 0 });
s.addText('用数据与 AI，照亮每一位高校学生的成长路径', { x: M, y: 4.15, w: 9, h: 0.6, fontFace: F_HEAD, fontSize: 21, color: TEXT, margin: 0, charSpacing: 1 });
s.addText('基于 AI 大模型的智慧教育全栈解决方案 —— 贯通 教 · 学 · 考 · 测 · 评', { x: M, y: 4.78, w: 10.2, h: 0.4, fontFace: F_BODY, fontSize: 13.5, color: SUB, margin: 0 });
// 底部能力芯片
const chips = ['AI 智能出题', 'AI 自动批改', '六维能力画像', '知识图谱', '在线考试', '个性推荐'];
const ccw = 1.93, ccgap = 0.2;
chips.forEach((c, i) => {
  const totalW = chips.length * ccw + (chips.length - 1) * ccgap;
  const x0 = (W - totalW) / 2;
  const x = x0 + i * (ccw + ccgap);
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 6.42, w: ccw, h: 0.5, rectRadius: 0.25, fill: { color: GLASS, transparency: 18 }, line: { color: GLASS_LINE, width: 0.7 } });
  s.addText(c, { x, y: 6.52, w: ccw, h: 0.3, align: 'center', fontFace: F_BODY, fontSize: 11.5, color: TEXT, margin: 0 });
});

// =========================================================
// S2 · 痛点
// =========================================================
s = pres.addSlide(); addBg(s, 'content-bg.png');
header(s, 'chart', '教学之困 · 传统教学的三大瓶颈', 'THE PROBLEM', CORAL);
const pains = [
  { t: '批改负担沉重', d: '多题型、主观题与编程题需差异化评分，教师逐题人工批改，反馈滞后、精力被大量消耗', c: CORAL },
  { t: '学情数据沉没', d: '成绩散落于不同环节，六维能力、知识点掌握度、错因分布缺乏体系化呈现，薄弱点难以定位', c: VIOLET },
  { t: '千人一面教学', d: '错题不归档、复习无计划，缺少个性化学习路径，学生自主提升高度依赖自觉', c: GOLD },
];
pains.forEach((p, i) => {
  const x = M + i * 4.18;
  glass(s, x, 1.7, 3.8, 4.7);
  iconCircle(s, ['scan', 'radar', 'users'][i], x + 0.35, 2.05, 0.72, p.c);
  s.addText(p.t, { x: x + 1.22, y: 2.22, w: 2.4, h: 0.5, fontFace: F_HEAD, fontSize: 17, bold: true, color: TEXT, margin: 0, valign: 'middle' });
  s.addText(p.d, { x: x + 0.35, y: 3.42, w: 3.05, h: 2.6, fontFace: F_BODY, fontSize: 14, color: SUB, margin: 0, lineSpacingMultiple: 1.25, valign: 'top' });
});
// 关键句
s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: M, y: 6.62, w: 12.09, h: 0.5, rectRadius: 0.25, fill: { color: GLASS, transparency: 26 }, line: { color: GLASS_LINE, width: 0.7 } });
s.addText('核心症结：教育资源的「供给效率」与「个体精细度」双双不足', { x: M, y: 6.72, w: 12.09, h: 0.3, align: 'center', fontFace: F_HEAD, fontSize: 14.5, color: GOLD, margin: 0 });
subSlide(s, '溯光 TracingLight · 参赛路演', M, 4);

// =========================================================
// S3 · 价值主张
// =========================================================
s = pres.addSlide(); addBg(s, 'content-bg.png');
header(s, 'trend', '我们的解法 · 一条 AI 驱动的教学数据闭环', 'THE SOLUTION', MINT);
// 主陈述
s.addText('从出题、作答、批改，到学情洞察、个性化推荐 —— 让每一次教学行为沉淀为数据，再反哺给每位师生。', { x: M, y: 1.6, w: 12.1, h: 0.75, fontFace: F_HEAD, fontSize: 17.5, color: TEXT, margin: 0, lineSpacingMultiple: 1.2 });
// 五节点闭环（横向箭头循环）
const loop = [
  { ic: 'bulb', t: 'AI 出题', c: INDIGO },
  { ic: 'book', t: '在线作答', c: CYAN },
  { ic: 'scan', t: 'AI 批改', c: VIOLET },
  { ic: 'gauge', t: '学情洞察', c: GOLD },
  { ic: 'target', t: '个性推荐', c: MINT },
];
const lw = 1.95, lgap = 0.5, lx0 = M + 0.4, ly = 3.35;
loop.forEach((n, i) => {
  const x = (W / 2) - 6.1 + i * (lw + lgap);
  const x2 = x + lw;
  glass(s, x, ly, lw, 1.75, { radius: 0.12 });
  iconCircle(s, n.ic, x + lw / 2 - 0.26, ly + 0.26, 0.52, n.c);
  s.addText(n.t, { x, y: ly + 0.98, w: lw, h: 0.4, align: 'center', fontFace: F_HEAD, fontSize: 13, bold: true, color: TEXT, margin: 0 });
  // 箭头
  if (i < loop.length - 1) s.addShape(pres.shapes.LINE, { x: x2 + 0.02, y: ly + 0.87, w: lgap - 0.04, h: 0, line: { color: '4A5B9A', width: 1.6 } });
});
// 三大支柱
const pil = [
  { ic: 'clock', t: '教学提效', d: 'AI 完成初评，教师专注复核与育人', c: INDIGO },
  { ic: 'gauge', t: '学情可见', d: '能力雷达 + 知识热力图 + 错因分析', c: GOLD },
  { ic: 'target', t: '因材施教', d: '薄弱点定位 + 智能排期的个性化计划', c: MINT },
];
pil.forEach((p, i) => {
  const x = M + i * 4.22;
  const y = 5.45;
  glass(s, x, y, 3.9, 1.5, { radius: 0.1 });
  iconCircle(s, p.ic, x + 0.3, y + 0.44, 0.62, p.c);
  cardTitle(s, x, y + 0.22, 2.6, p.t, p.c, p.ic, x + 1.05);
  s.addText(p.d, { x: x + 1.05, y: y + 0.72, w: 2.75, h: 0.7, fontFace: F_BODY, fontSize: 12, color: SUB, margin: 0, valign: 'top' });
});
subSlide(s, '由数据闭环放大规模，由 AI 精细化到个体 —— 解决供给效率与个体精细度双重不足', M, 12);

// =========================================================
// S4 · 核心功能全景（三端）
// =========================================================
s = pres.addSlide(); addBg(s, 'content-bg.png');
header(s, 'layers', '三端一体 · 核心功能全景图', 'END-TO-END PLATFORM');
const tptides = [
  { role: '教师端', en: 'TEACHER', c: INDIGO, feats: ['AI 智能出题（多题型 / 知识点）', 'AI 四维自动批改 + 逐题确认', '学生学情详情 + 一键 AI 学情报告', '在线考试 / 防作弊 / 成绩公布', '题库与批改规则配置管理'] },
  { role: '学生端', en: 'STUDENT', c: CYAN, feats: ['六维能力画像 + 知识图谱', '今日任务聚合 + 艾宾浩斯错题复习', 'AI 学情分析 + 智能答疑', '个性化学习计划（结合课表）', '学习材料智能推荐与阅读'] },
  { role: '管理端', en: 'ADMIN', c: VIOLET, feats: ['学校 / 学院 / 班级统一管理', '用户与权限 / 平台配置', 'AI 配置与大模型接入管理', '批改队列与系统运行监控', '审计日志与统一运维'] },
];
tptides.forEach((td, i) => {
  const x = M + i * 4.22;
  glass(s, x, 1.7, 3.9, 5.15, { radius: 0.08 });
  glass(s, x + 0.25, 1.95, 3.4, 0.86, { fillT: 8, line: td.c, lineW: 1, radius: 0.1 });
  s.addText(td.role, { x: x + 0.25, y: 2.05, w: 3.4, h: 0.4, align: 'center', fontFace: F_HEAD, fontSize: 19, bold: true, color: TEXT, margin: 0 });
  s.addText(td.en, { x: x + 0.25, y: 2.48, w: 3.4, h: 0.3, align: 'center', fontFace: F_BODY, fontSize: 9.5, color: td.c, charSpacing: 3, margin: 0 });
  s.addText(td.feats.map((f, j) => ({ text: f, options: { bullet: { code: '2022', color: td.c }, color: SUB, breakLine: j < td.feats.length - 1, paraSpaceAfter: 9 } })),
    { x: x + 0.35, y: 3.1, w: 3.2, h: 3.5, fontFace: F_BODY, fontSize: 13, lineSpacingMultiple: 1.12, margin: 0 });
});
subSlide(s, '一套平台贯通教学全流程，教师、学生、管理者各取所需', M, 12);

// =========================================================
// S5 · AI 出题与批改
// =========================================================
s = pres.addSlide(); addBg(s, 'content-bg.png');
header(s, 'spark', 'AI 智能出题 · AI 自动批改', 'AI-EMPOWERED ASSESSMENT');
// 左：出题
glass(s, M, 1.75, 5.9, 4.2, { radius: 0.09 });
iconCircle(s, 'bulb', M + 0.4, 2.05, 0.66, INDIGO);
cardTitle(s, M, 2.2, 5, 'AI 智能出题', INDIGO, null);
s.addText(['按知识点 / 题型 / 难度配置，一键批量生成 1–20 题', '单选 / 多选 / 判断 / 填空 / 简答 / 编程多题型覆盖', '生成结果质量自检、勾选一键入库，支持图片内容出题'].map((t, i) => ({ text: t, options: { bullet: { code: '2022' }, color: SUB, breakLine: i < 2, paraSpaceAfter: 8 } })),
  { x: M + 0.4, y: 3.0, w: 5.1, h: 2.6, fontFace: F_BODY, fontSize: 13.5, lineSpacingMultiple: 1.15, margin: 0 });
// 右：批改
glass(s, W - M - 5.9, 1.75, 5.9, 4.2, { radius: 0.09 });
iconCircle(s, 'scan', W - M - 5.9 + 0.4, 2.05, 0.66, VIOLET);
cardTitle(s, W - M - 5.9, 2.2, 5, 'AI 四维自动批改', VIOLET, null);
s.addText(['准确性 · 逻辑性 · 表达 · 拓展 四维量化评分', '流式批改，AI 原评 → 教师逐题确认，双向对比', '批改规则（评分标准 / 扣分 / 评语 / 等级）按课程差异化配置'].map((t, i) => ({ text: t, options: { bullet: { code: '2022' }, color: SUB, breakLine: i < 2, paraSpaceAfter: 8 } })),
  { x: W - M - 5.9 + 0.4, y: 3.0, w: 5.1, h: 2.6, fontFace: F_BODY, fontSize: 13.5, lineSpacingMultiple: 1.15, margin: 0 });
// 底部：四个维度 chips
const dims = [['准确性', INDIGO], ['逻辑性', CYAN], ['表达', VIOLET], ['拓展', GOLD]];
dims.forEach((d, i) => {
  const cw = 2.6, gap = 0.31, x0 = M + 0.55 + i * (cw + gap);
  glass(s, x0, 6.15, cw, 0.72, { radius: 0.14, fillT: 14, line: d[1], lineW: 1 });
  s.addText(d[0], { x: x0, y: 6.32, w: cw, h: 0.4, align: 'center', fontFace: F_HEAD, fontSize: 17, bold: true, color: d[1], margin: 0 });
});
subSlide(s, 'AI 负责规模化初评，教师专注高价值复核 —— 人机协同、可控可信', M, 12);

// =========================================================
// S6 · 学情数据引擎（六维雷达）
// =========================================================
s = pres.addSlide(); addBg(s, 'content-bg.png');
header(s, 'radar', '学情数据引擎 · 从抽象成绩到多维能力画像', 'LEARNING ANALYTICS', CYAN);
// 左：六维雷达（手绘）
const RX = 3.05, RY = 4.0, RR = 1.55; // 雷达中心与半径
const axes = ['记忆理解', '综合应用', '知识准确', '逻辑思维', '表达呈现', '迁移拓展'];
const tot = axes.length;
const ang = (i) => (-90 + (360 / tot) * i) * (Math.PI / 180);
const pt = (i, r) => [RX + r * Math.cos(ang(i)), RY + r * Math.sin(ang(i))];
function hex(sl, r, color, width) {
  for (let i = 0; i < tot; i++) {
    const [x1, y1] = pt(i, r), [x2, y2] = pt((i + 1) % tot, r);
    sl.addShape(pres.shapes.LINE, { x: x1, y: y1, w: x2 - x1, h: y2 - y1, line: { color, width } });
  }
}
// 三层网格（同心六边形）
for (const ring of [0.33, 0.66, 1]) {
  hex(s, RR * ring, '4A5B9A', 0.7);
}
// 轴辐（中心→顶点）
axes.forEach((_, i) => {
  const [x1, y1] = pt(i, RR), [x2, y2] = pt(i, RR * 0.12);
  s.addShape(pres.shapes.LINE, { x: x2, y: y2, w: x1 - x2, h: y1 - y2, line: { color: '3E4E85', width: 0.6 } });
});
// 轴标签
axes.forEach((a, i) => {
  const p = pt(i, RR + 0.52);
  s.addText(a, { x: p[0] - 0.75, y: p[1] - 0.22, w: 1.5, h: 0.44, align: 'center', fontFace: F_BODY, fontSize: 11, color: SUB, margin: 0 });
});
// 数据多边形（示例：饱满能力画像）
const data = [86, 78, 92, 74, 88, 62];
{
  // 数据顶点之间的连线（发光描边）
  for (let i = 0; i < tot; i++) {
    const [x1, y1] = pt(i, RR * (data[i] / 100)), [x2, y2] = pt((i + 1) % tot, RR * (data[(i + 1) % tot] / 100));
    s.addShape(pres.shapes.LINE, { x: x1, y: y1, w: x2 - x1, h: y2 - y1, line: { color: CYAN, width: 2.2 } });
  }
  // 顶点光点
  for (let i = 0; i < tot; i++) {
    const [px, py] = pt(i, RR * (data[i] / 100));
    s.addShape(pres.shapes.OVAL, { x: px - 0.06, y: py - 0.06, w: 0.12, h: 0.12, fill: { color: CYAN }, line: { color: '000000', transparency: 100 } });
  }
}
s.addText('六维能力雷达', { x: RX - 1.0, y: 6.42, w: 2, h: 0.35, align: 'center', fontFace: F_HEAD, fontSize: 13, bold: true, color: CYAN, margin: 0 });
// 右：三张洞察卡
const ins = [
  { ic: 'network', t: '知识热力图', d: '课程 → 模块 → 知识点逐层掌握度，一目了然', c: INDIGO },
  { ic: 'trend', t: '错因与趋势', d: '粗心 / 概念 / 方法错因分布 + 成绩波动稳定性', c: GOLD },
  { ic: 'chart', t: '分层与排名', d: '精通 / 良好 / 薄弱 / 未学四色分层，班级对比定位', c: VIOLET },
];
ins.forEach((p, i) => {
  const x = 6.05, y = 1.8 + i * 1.62;
  glass(s, x, y, 6.5, 1.4, { radius: 0.1 });
  iconCircle(s, p.ic, x + 0.3, y + 0.36, 0.68, p.c);
  cardTitle(s, x, y + 0.3, 5.5, p.t, p.c, null);
  s.addText(p.d, { x: x + 0.34, y: y + 0.82, w: 5.9, h: 0.5, fontFace: F_BODY, fontSize: 13, color: SUB, margin: 0, valign: 'top' });
});
subSlide(s, '能力画像由真实作答逐维度加权计算，而非单一总分 —— 让「偏科」与「薄弱」第一次被看见', 6.05, 6);

// =========================================================
// S7 · 在线考试与防作弊
// =========================================================
s = pres.addSlide(); addBg(s, 'content-bg.png');
header(s, 'shield', '在线考试与防作弊 · 全链路可信', 'EXAM INTEGRITY', CORAL);
const chain = [
  { ic: 'bulb', t: '按知识点 AI 出题', d: '题型 / 难度 / 时长可配' },
  { ic: 'book', t: '在线答题', d: '实时采集作答' },
  { ic: 'shield', t: '防作弊监控', d: '切屏 / 离开检测' },
  { ic: 'scan', t: 'AI 批改复核', d: '人工关分复核' },
  { ic: 'award', t: '成绩公布', d: '复核后学生可见' },
];
const cw = 2.28, cgap = 0.28, x0 = M + 0.15, cY = 1.85;
chain.forEach((n, i) => {
  const x = (W - (chain.length * cw + (chain.length - 1) * cgap)) / 2 + i * (cw + cgap);
  glass(s, x, cY, cw, 2.0, { radius: 0.12 });
  iconCircle(s, n.ic, x + cw / 2 - 0.26, cY + 0.28, 0.52, CORAL);
  s.addText(n.t, { x: x + 0.1, y: cY + 0.94, w: cw - 0.2, h: 0.4, align: 'center', fontFace: F_HEAD, fontSize: 13, bold: true, color: TEXT, margin: 0 });
  s.addText(n.d, { x: x + 0.1, y: cY + 1.34, w: cw - 0.2, h: 0.5, align: 'center', fontFace: F_BODY, fontSize: 11, color: MUTE, margin: 0 });
  if (i < chain.length - 1) s.addShape(pres.shapes.LINE, { x: x + cw + 0.02, y: cY + 1.0, w: cgap - 0.04, h: 0, line: { color: '6A5BC9', width: 1.8 } });
});
// 复核与申诉
glass(s, M, 4.25, 6.0, 2.35, { radius: 0.09 });
iconCircle(s, 'check', M + 0.35, 4.55, 0.6, GOLD);
cardTitle(s, M, 4.68, 5.2, '人工复核 + 成绩申诉', GOLD);
s.addText('AI 批改初评 + 教师逐题复核确认，成绩受控发布；申诉改分联动回写掌握度与错题本，评卷闭环可追溯。', { x: M + 0.35, y: 5.18, w: 5.3, h: 1.2, fontFace: F_BODY, fontSize: 13.5, color: SUB, margin: 0, lineSpacingMultiple: 1.2 });
glass(s, W - M - 6.0, 4.25, 6.0, 2.35, { radius: 0.09 });
iconCircle(s, 'clock', W - M - 6.0 + 0.35, 4.55, 0.6, CYAN);
cardTitle(s, W - M - 6.0, 4.68, 5.2, '智能监控 + 授权放行', CYAN);
s.addText('切屏 / 离开页面实时检测与记录，配合限时作答与教师在线监控；异常行为存档，供复核核验，公正可信。', { x: W - M - 6.0 + 0.35, y: 5.18, w: 5.3, h: 1.2, fontFace: F_BODY, fontSize: 13.5, color: SUB, margin: 0, lineSpacingMultiple: 1.2 });
subSlide(s, '从出题到公布到申诉，全链路数据可追溯 —— 保障考试公平性同时保留 AI 提效', M, 12);

// =========================================================
// S8 · 个性化学习
// =========================================================
s = pres.addSlide(); addBg(s, 'content-bg.png');
header(s, 'brain', '个性化学习 · 让薄弱点被看见、被干预', 'PERSONALIZED LEARNING', MINT);
// 左：诊断→干预闭环（序列）
const steps = [
  { ic: 'radar', t: '能力诊断', d: '多维度掌握度 / 薄弱点识别' },
  { ic: 'target', t: '路径规划', d: 'AI 结合课表智能排期' },
  { ic: 'book', t: '专项干预', d: '薄弱点练习 + 错题及时复习' },
  { ic: 'trend', t: '效果反馈', d: '掌握度实时更新再诊断' },
];
steps.forEach((st, i) => {
  const y = 1.8 + i * 1.22;
  glass(s, M, y, 5.6, 1.02, { radius: 0.12 });
  iconCircle(s, st.ic, M + 0.28, y + 0.2, 0.62, MINT);
  s.addText(st.t, { x: M + 1.08, y: y + 0.14, w: 4.3, h: 0.35, fontFace: F_HEAD, fontSize: 14.5, bold: true, color: TEXT, margin: 0 });
  s.addText(st.d, { x: M + 1.08, y: y + 0.5, w: 4.3, h: 0.4, fontFace: F_BODY, fontSize: 12, color: SUB, margin: 0 });
});
// 右：场景要点
const scen = [
  { t: '知识图谱', d: '课程→模块→知识点层级可视化，掌握度一屏掌握', c: INDIGO },
  { t: 'AI 学习计划', d: '结合课表与考试，自动生成每日 2–3 时段学习安排', c: CYAN },
  { t: '艾宾浩斯复习', d: '错题按遗忘曲线自动排期，到期待办智能推送', c: VIOLET },
  { t: '智能答疑', d: 'AI 学情问答直达结症，辅助自主理解', c: GOLD },
];
scen.forEach((sc, i) => {
  const x = 6.5, y = 1.8 + i * 1.22;
  glass(s, x, y, 6.2, 1.02, { radius: 0.12 });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: y, w: 0.09, h: 1.02, rectRadius: 0.05, fill: { color: sc.c }, line: { color: '000000', transparency: 100 } });
  cardTitle(s, x + 0.3, y + 0.14, 5.6, sc.t, sc.c, null);
  s.addText(sc.d, { x: x + 0.3, y: y + 0.52, w: 5.6, h: 0.4, fontFace: F_BODY, fontSize: 12, color: SUB, margin: 0 });
});
subSlide(s, '不是推荐「更多题」，而是推荐「更对的学习动作」—— 时间排期与内容难度双管齐下', 6.5, 6);

// =========================================================
// S9 · 技术架构
// =========================================================
s = pres.addSlide(); addBg(s, 'content-bg.png');
header(s, 'code', '技术架构 · 全栈工程化落地', 'TECHNICAL ARCHITECTURE');
const arch = [
  { l: '应用层', sub: 'Next.js 16 · React 19 · TypeScript 5', ds: '三端一体化 SPA + SSR，流式批改交互', c: INDIGO },
  { l: '服务层', sub: 'API Routes · 权限 · 审计 · 限流', ds: '角色路由守卫 + IDOR 越权隔离 + 操作审计', c: CYAN },
  { l: 'AI 层', sub: '智谱 GLM-4-Flash · 结构化输出 · 流式', ds: '出题 / 批改 / 答疑 / 学情报告多 agent 编排', c: VIOLET },
  { l: '数据层', sub: 'PostgreSQL · Drizzle ORM · 事务一致性', ds: '原子扣减防并发超卖 · 序列 / 迁移样板化', c: GOLD },
];
arch.forEach((a, i) => {
  const y = 1.75 + i * 1.26;
  glass(s, M, y, 12.09, 1.06, { radius: 0.1 });
  // 层级条
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: M + 0.25, y: y + 0.2, w: 2.5, h: 0.66, rectRadius: 0.12, fill: { color: a.c, transparency: 12 }, line: { color: a.c, width: 1 } });
  s.addText(a.l, { x: M + 0.25, y: y + 0.33, w: 2.5, h: 0.4, align: 'center', fontFace: F_HEAD, fontSize: 15, bold: true, color: TEXT, margin: 0 });
  // 描述
  s.addText(a.sub, { x: M + 3.0, y: y + 0.18, w: 8.9, h: 0.36, fontFace: F_HEAD, fontSize: 14.5, bold: true, color: TEXT, margin: 0 });
  s.addText(a.ds, { x: M + 3.0, y: y + 0.55, w: 8.9, h: 0.4, fontFace: F_BODY, fontSize: 12, color: SUB, margin: 0 });
});
// 底部品质条
const qa = [['674 处同步调用异步化', INDIGO], ['tsc 全量编译通过', CYAN], ['架构样板化 / 可迁移', VIOLET], ['一键部署 Win+Linux', GOLD]];
qa.forEach((q, i) => {
  const cw = 2.8, gap = 0.22, x0 = M + 0.15 + i * (cw + gap);
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x0, y: 6.55, w: cw, h: 0.5, rectRadius: 0.25, fill: { color: GLASS, transparency: 20 }, line: { color: q[1], width: 0.8 } });
  s.addText(q[0], { x: x0, y: 6.65, w: cw, h: 0.3, align: 'center', fontFace: F_HEAD, fontSize: 11.5, bold: true, color: q[1], margin: 0 });
});

// =========================================================
// S10 · 工程质量与安全
// =========================================================
s = pres.addSlide(); addBg(s, 'content-bg.png');
header(s, 'lock', '工程质量与安全 · 可交付级信任', 'ENGINEERING QUALITY & SECURITY', GOLD);
const safe = [
  { ic: 'layers', t: '数据一致性', d: '事务 + 条件更新原子扣减，杜绝并发超卖', c: INDIGO },
  { ic: 'shield', t: '越权隔离', d: '教师数据归属强校验，IDOR 防护贯穿接口', c: CYAN },
  { ic: 'lock', t: '认证安全', d: 'bcrypt 密码 · JWT httpOnly Cookie · 登录限流', c: VIOLET },
  { ic: 'code', t: '迁移演进', d: '674 处同步调用全面异步化，架构向 PG 平稳迁移', c: GOLD },
];
safe.forEach((p, i) => {
  const x = M + (i % 2) * 6.15, y = 1.75 + Math.floor(i / 2) * 2.15;
  glass(s, x, y, 5.95, 1.95, { radius: 0.1 });
  iconCircle(s, p.ic, x + 0.35, y + 0.5, 0.92, p.c);
  cardTitle(s, x + 1.5, y + 0.42, 4.2, p.t, p.c, null);
  s.addText(p.d, { x: x + 1.5, y: y + 0.86, w: 4.2, h: 0.9, fontFace: F_BODY, fontSize: 13, color: SUB, margin: 0, lineSpacingMultiple: 1.15 });
});
subSlide(s, '面向真实部署的工程考量：从安全、一致性到跨平台交付的全链路质量保障', M, 12);

// =========================================================
// S11 · 数据与验证成果
// =========================================================
s = pres.addSlide(); addBg(s, 'content-bg.png');
header(s, 'award', '数据与验证成果', 'VALIDATION');
const stats = [
  ['题目库', '160', '+', '题', INDIGO],
  ['批改流水', '1660', '+', '条', CYAN],
  ['作业记录', '24', '+', '份', VIOLET],
  ['知识体系', '100', '+', '点', GOLD],
];
stats.forEach((st, i) => {
  const cw = 2.86, gap = 0.22, x0 = M + 0.15 + i * (cw + gap);
  glass(s, x0, 1.85, cw, 1.6, { radius: 0.1 });
  s.addText(st[2], { x: x0, y: 2.12, w: cw, h: 0.8, align: 'center', fontFace: F_NUM, fontSize: 44, bold: true, color: st[4], margin: 0 });
  s.addText(st[0], { x: x0, y: 3.02, w: cw, h: 0.35, align: 'center', fontFace: F_HEAD, fontSize: 13, bold: true, color: TEXT, margin: 0 });
});
// 质量验证卡
const valid = [
  { t: '生产构建通过', d: 'Next.js 全量编译无错误', c: MINT },
  { t: '回归测试 6/6', d: '单测 + 三角色 API 冒烟全绿', c: CYAN },
  { t: 'API 冒烟 53 端点', d: '真实失败 0，仅预期 4xx', c: VIOLET },
  { t: '类型检查通过', d: '全项目 tsc 编译通过', c: GOLD },
];
valid.forEach((v, i) => {
  const x = M + (i % 2) * 6.15, y = 3.75 + Math.floor(i / 2) * 1.55;
  glass(s, x, y, 5.95, 1.35, { radius: 0.1 });
  iconCircle(s, 'check', x + 0.3, y + 0.36, 0.6, v.c);
  s.addText(v.t, { x: x + 1.1, y: y + 0.24, w: 4.6, h: 0.4, fontFace: F_HEAD, fontSize: 15, bold: true, color: TEXT, margin: 0 });
  s.addText(v.d, { x: x + 1.1, y: y + 0.68, w: 4.6, h: 0.5, fontFace: F_BODY, fontSize: 12, color: SUB, margin: 0 });
});
s.addText('注：上组为确定性演示基线数据；功能集与工程质量为本项目可交付能力。', { x: M, y: 6.72, w: 10, h: 0.3, fontFace: F_BODY, fontSize: 10, color: MUTE, margin: 0 });
subSlide(s, '完整代码、接口与部署脚本已开源托管，可现场演示', M, 12);

// =========================================================
// S12 · 落地与商业路径
// =========================================================
s = pres.addSlide(); addBg(s, 'content-bg.png');
header(s, 'building', '落地路径 · 从产品到场侧', 'GO-TO-MARKET', MINT);
const gm = [
  { ic: 'grad', t: '目标场景', d: '高校计算机类课程作业与考试管理，贴近一线教学真需求', c: INDIGO },
  { ic: 'server', t: '交付形态', d: '私有化部署 + 校园一体化，Windows & Linux 一键部署', c: CYAN },
  { ic: 'users', t: '运营循环', d: '教师建资源 → 学生实际使用 → 沉留学情 → 反哺教法', c: VIOLET },
  { ic: 'trend', t: '价值放大', d: '校本知识库沉淀、差异化教评数据，成为学校教学资产', c: GOLD },
];
gm.forEach((p, i) => {
  const x = M + (i % 2) * 6.15, y = 1.8 + Math.floor(i / 2) * 2.2;
  glass(s, x, y, 5.95, 2.0, { radius: 0.1 });
  iconCircle(s, p.ic, x + 0.35, y + 0.6, 0.82, p.c);
  cardTitle(s, x + 1.4, y + 0.45, 4.3, p.t, p.c, null);
  s.addText(p.d, { x: x + 1.4, y: y + 0.92, w: 4.3, h: 0.9, fontFace: F_BODY, fontSize: 13, color: SUB, margin: 0, lineSpacingMultiple: 1.15 });
});
s.addText('从「一次产品交付」走向「持续教学数据增值」—— 服务一所学校，沉淀一份教育数据资产。', { x: M, y: 6.5, w: 12.09, h: 0.5, align: 'center', fontFace: F_HEAD, fontSize: 15, bold: true, color: MINT, margin: 0 });

// =========================================================
// S13 · 未来规划
// =========================================================
s = pres.addSlide(); addBg(s, 'content-bg.png');
header(s, 'rocket', '未来规划 · 三步迈向更大价值', 'ROADMAP');
const road = [
  { ph: '近期 · 打磨', t: '全场景体验', d: ['更多题型与学科适配', '学情报告数据口径深化', '教师工作台体验打磨'], c: INDIGO },
  { ph: '中期 · 深耕', t: '知识服务', d: ['校本知识库共建', '多模态与语音互动启蒙', '跨校教育资源协作'], c: VIOLET },
  { ph: '远期 · 引领', t: '教育智能', d: ['教育场景大模型微调', '教育数据资产化服务', '产学研联合示范应用'], c: GOLD },
];
road.forEach((r, i) => {
  const x = M + i * 4.22;
  const y = 2.0;
  glass(s, x, y, 3.9, 4.2, { radius: 0.1 });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x + 0.3, y: y + 0.3, w: 3.3, h: 0.52, rectRadius: 0.26, fill: { color: r.c, transparency: 15 }, line: { color: r.c, width: 0.9 } });
  s.addText(r.ph, { x: x + 0.3, y: y + 0.4, w: 3.3, h: 0.32, align: 'center', fontFace: F_HEAD, fontSize: 13, bold: true, color: TEXT, margin: 0 });
  s.addText(r.t, { x: x + 0.3, y: y + 1.05, w: 3.3, h: 0.45, fontFace: F_HEAD, fontSize: 17, bold: true, color: r.c, margin: 0 });
  s.addText(r.d.map((t, j) => ({ text: t, options: { bullet: { code: '2022' }, color: SUB, breakLine: j < r.d.length - 1, paraSpaceAfter: 8 } })),
    { x: x + 0.3, y: y + 1.65, w: 3.3, h: 2.2, fontFace: F_BODY, fontSize: 13, lineSpacingMultiple: 1.15, margin: 0 });
  if (i < road.length - 1) s.addShape(pres.shapes.LINE, { x: x + 3.9 + 0.12, y: y + 1.0, w: 0.2, h: 0, line: { color: '6A5BC9', width: 1.6 } });
});
subSlide(s, '以 AI 为基座，从「教学工具」成长为「教育智能」—— 方向清晰、分步落地', M, 12);

// =========================================================
// S14 · 结语
// =========================================================
s = pres.addSlide(); addBg(s, 'end-bg.png');
s.addText('溯 光', { x: 0, y: 3.05, w: 13.333, h: 1.2, align: 'center', fontFace: F_HEAD, fontSize: 60, bold: true, color: TEXT, margin: 0 });
s.addText('以 AI 为光，照见每一位学生的成长路径', { x: 0, y: 4.35, w: 13.333, h: 0.6, align: 'center', fontFace: F_HEAD, fontSize: 20, color: SUB, margin: 0 });
s.addText('感谢聆听 · 期待与您同行', { x: 0, y: 5.1, w: 13.333, h: 0.5, align: 'center', fontFace: F_BODY, fontSize: 14, color: GOLD, margin: 0 });
iconCircle(s, 'spark', 13.333 / 2 - 0.4, 5.95, 0.8, VIOLET, true);
subSlide(s, 'tracing-light · 高中/高校智慧教育 AI 平台 · 项目组', 0, 13.333);

// 输出
const OUT = path.join(__dirname, '..', '..', '溯源光·参赛路演.pptx');
pres.writeFile({ fileName: OUT }).then(() => console.log('written', OUT)).catch((e) => { console.error(e); process.exit(1); });