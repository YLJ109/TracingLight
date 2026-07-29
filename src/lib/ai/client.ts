/**
 * AI 客户端 - 智谱 GLM API
 * 基于智谱开放平台 API (https://open.bigmodel.cn)
 */

const ZHIPU_BASE_URL = process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';
const ZHIPU_MODEL = process.env.ZHIPU_MODEL || 'glm-4-flash';

function getApiKey(): string {
  const key = process.env.ZHIPU_API_KEY;
  if (!key) {
    throw new Error('ZHIPU_API_KEY 环境变量未设置，请在 .env 文件中配置智谱 API Key');
  }
  return key;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
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

  constructor() {
    this.apiKey = getApiKey();
    this.baseUrl = ZHIPU_BASE_URL;
  }

  /**
   * 调用智谱 Chat Completion API（非流式）
   */
  async invoke(messages: ChatMessage[], options: InvokeOptions = {}): Promise<{ content: string }> {
    const { model = ZHIPU_MODEL, temperature = 0.3, max_tokens = 4096 } = options;

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
    const { model = ZHIPU_MODEL, temperature = 0.3, max_tokens = 4096 } = options;

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
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt },
  ];

  const response = await client.invoke(messages, {
    model: ZHIPU_MODEL,
    temperature,
  });

  // Extract JSON from response
  const content = response.content;

  // Try to find JSON in code block first
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim()) as T;
    } catch {
      // Continue to other methods
    }
  }

  // Try to find JSON array
  const arrayMatch = content.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]) as T;
    } catch {
      // Continue to other methods
    }
  }

  // Try to find JSON object
  const objMatch = content.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]) as T;
    } catch {
      // Continue to other methods
    }
  }

  throw new Error(`Failed to parse structured output: ${content.substring(0, 200)}`);
}
