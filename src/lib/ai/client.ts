/**
 * AI 客户端 - 智谱 GLM API
 * 基于智谱开放平台 API (https://open.bigmodel.cn)
 */
import { NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { systemConfig } from '@/storage/database/shared/schema';

const ZHIPU_BASE_URL = process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';
const ZHIPU_MODEL = process.env.ZHIPU_MODEL || 'glm-4-flash';

function getApiKey(): string {
  const key = process.env.ZHIPU_API_KEY;
  if (!key) {
    throw new Error('ZHIPU_API_KEY 环境变量未设置，请在 .env 文件中配置智谱 API Key');
  }
  return key;
}

/**
 * AI 服务未配置错误：前端据此弹窗引导到管理端配置
 */
export class AIConfigError extends Error {
  code = 'AI_NOT_CONFIGURED';
  constructor(message?: string) {
    super(message || 'AI 服务未配置，请管理员前往「管理端 → 系统设置」配置 AI 服务（API 地址 / Key / 模型）');
    this.name = 'AIConfigError';
  }
}

export function isAIConfigError(e: unknown): e is AIConfigError {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'AI_NOT_CONFIGURED';
}

/** 形如占位符/示例的 Key，视为「未配置」，避免拿去调智谱返回 401 */
const PLACEHOLDER_KEYS = [
  'your_zhipu_api_key_here',
  'your_api_key',
  'your-zhipu-api-key',
  'sk-your-key',
  'placeholder',
  'put_your_api_key_here',
  'changeme',
];

export function isPlaceholderKey(key: string): boolean {
  return PLACEHOLDER_KEYS.includes(key.trim().toLowerCase());
}

/**
 * 从管理端 system_config 读取 AI 服务配置（DB 优先，env 兜底）
 * 支持管理后台「系统设置」在线切换 API 地址 / Key / 模型，立即生效无需重启。
 * key 约定：ai_base_url / ai_api_key / ai_model
 */
function getRuntimeConfig(): { apiKey: string; baseUrl: string; model: string } {
  let baseUrl = ZHIPU_BASE_URL;
  let model = ZHIPU_MODEL;
  let apiKey = process.env.ZHIPU_API_KEY || '';
  try {
    // 从管理端 system_config 读取（DB 优先，env 兜底）。静态导入经 Next 打包正确解析，生产亦生效。
    const rows = getDb().select().from(systemConfig).all();
    const map = new Map(rows.map((r: { key: string; value: string | null }) => [r.key, r.value]));
    if (map.get('ai_base_url')) baseUrl = String(map.get('ai_base_url'));
    if (map.get('ai_model')) model = String(map.get('ai_model'));
    if (map.get('ai_api_key')) apiKey = String(map.get('ai_api_key'));
  } catch { /* DB 未就绪 → 用 env 兜底 */ }
  // 空值或占位符都视为「未配置」，给出可操作提示而非拿假 Key 调接口 401
  if (!apiKey || isPlaceholderKey(apiKey)) throw new AIConfigError();
  return { apiKey, baseUrl, model };
}

type MessageContent =
  | string
  | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: MessageContent;
}

/** 图片理解（多模态出题等）：视觉模型提取图片中的内容 */
export async function extractTextFromImage(
  imageBase64: string,
  prompt: string,
  visionModel = 'glm-4v-flash'
): Promise<string> {
  const client = createAIClient();
  const dataUrl = imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`;
  const response = await client.invoke(
    [
      { role: 'user', content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: dataUrl } },
      ] },
    ],
    { model: visionModel, temperature: 0.1, max_tokens: 2000 }
  );
  return response.content;
}

interface InvokeOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

interface StreamChunk {
  content: string;
}

/**
 * HeaderUtils — 向后兼容，智谱 API 无需特殊请求头
 */
export const HeaderUtils = {
  extractForwardHeaders(_headers?: Headers | Record<string, string>): Record<string, string> {
    // 智谱 API 不需要特殊头信息，返回空对象
    return {};
  },
};

/**
 * 智谱 API 客户端
 */
class ZhipuClient {
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor() {
    const cfg = getRuntimeConfig();
    this.apiKey = cfg.apiKey;
    this.baseUrl = cfg.baseUrl;
    this.defaultModel = cfg.model;
  }

  /**
   * 调用智谱 Chat Completion API（非流式）
   */
  async invoke(messages: ChatMessage[], options: InvokeOptions = {}): Promise<{ content: string }> {
    const { model = this.defaultModel, temperature = 0.3, max_tokens = 4096 } = options;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`智谱 API 调用失败 (${response.status}): ${errBody}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    return { content };
  }

  /**
   * 流式调用智谱 Chat Completion API
   */
  async *stream(messages: ChatMessage[], options: InvokeOptions = {}): AsyncGenerator<StreamChunk> {
    const { model = this.defaultModel, temperature = 0.3, max_tokens = 4096 } = options;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`智谱 API 流式调用失败 (${response.status}): ${errBody}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('无法获取响应流');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const jsonStr = trimmed.slice(6);
          if (jsonStr === '[DONE]') return;

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) {
              yield { content: delta.content };
            }
          } catch {
            // 跳过无法解析的行
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

/**
 * 创建智谱 AI 客户端
 */
export function createAIClient(_headers?: Record<string, string>): ZhipuClient {
  return new ZhipuClient();
}

/**
 * Invoke LLM with structured JSON output parsing
 * 保持与原接口完全兼容
 */
export async function invokeStructured<T>(
  client: ZhipuClient,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.3
): Promise<T> {
  // 免费模型偶发输出带杂讯/截断的 JSON，导致一次解析失败。用「首轮 + 严格化低温度重试」压制偶发失败：
  // 首轮用传入温度；失败后的重试降为 0.1（更稳定）并追加"只输出单个 JSON"约束（智谱 API 无状态，重新携带全量消息即可）。
  const maxAttempts = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];
    // 非首轮：强制只回单个 JSON 对象，禁止任何解释/代码块标记；并用低温度提升一致性
    if (attempt > 1) {
      messages.push({
        role: 'user' as const,
        content: '\n（注意：刚才的输出解析失败。请只输出一个完整、合法的 JSON 对象，不要包含任何解释、Markdown 代码块标记或多余文字，所有字符串需正确转义。）',
      });
    }
    const retryTemp = attempt === 1 ? temperature : 0.1;

    const response = await client.invoke(messages, { temperature: retryTemp });
    const content = response.content;

    // 依次尝试从代码块 / 数组 / 对象提取 JSON
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      try { return JSON.parse(codeBlockMatch[1].trim()) as T; } catch { /* 继续 */ }
    }
    const arrayMatch = content.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try { return JSON.parse(arrayMatch[0]) as T; } catch { /* 继续 */ }
    }
    const objMatch = content.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { return JSON.parse(objMatch[0]) as T; } catch { /* 继续 */ }
    }

    lastError = new Error(`Failed to parse structured output: ${content.substring(0, 200)}`);
    console.error('invokeStructured parse failed (attempt ' + attempt + '). length=' + content.length + ' tail=' + JSON.stringify(content.slice(-100)));
  }

  throw lastError || new Error('结构化输出解析失败');
}

/**
 * 统一处理：AI 服务未配置 → 503 + code，供前端弹窗引导到管理端配置；其他错误返回 null 走原逻辑
 */
export function aiErrorResponse(e: unknown): NextResponse | null {
  if (isAIConfigError(e)) {
    return NextResponse.json(
      { code: 'AI_NOT_CONFIGURED', error: 'AI 服务未配置：请管理员登录后前往「管理端 → 系统设置 → AI 服务配置」填写 API 地址与 Key' },
      { status: 503 }
    );
  }
  return null;
}
