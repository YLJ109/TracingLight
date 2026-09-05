import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { extractTextFromImage, isAIConfigError } from '@/lib/ai/client';

/**
 * 多模态出题：图片 → 文字提取（视觉模型 glm-4v-flash）
 * POST { image: base64DataUrl }
 */
export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const body = await request.json();
    const image = String(body?.image || '');
    if (!image.startsWith('data:image/')) {
      return NextResponse.json({ success: false, error: '缺少图片数据' }, { status: 400 });
    }

    const text = await extractTextFromImage(
      image,
      '请仔细识别这张图片中的所有题目文字、代码、图表与公式，完整转写为纯文本。保留题号与选项结构（A/B/C/D），不要添加解释，直接输出识别内容。',
    );

    return NextResponse.json({ success: true, data: { text } });
  } catch (e) {
    if (isAIConfigError(e)) {
      return NextResponse.json(
        { code: 'AI_NOT_CONFIGURED', error: 'AI 服务未配置：请管理员前往「管理端 → 系统设置 → AI 服务配置」填写 API 地址与 Key' },
        { status: 503 }
      );
    }
    console.error('Image OCR error:', e);
    return NextResponse.json({ success: false, error: '图片识别失败，请重试' }, { status: 500 });
  }
}
