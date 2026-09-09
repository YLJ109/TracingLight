/**
 * 错题本 AI 归因：真正调用大模型生成本次错在哪、知识点讲解、学习建议。
 * 区别于直接复用评分评语（评语关注"答得如何"，归因关注"为什么错 + 怎么补"）。
 * 失败（AI 未配置/超时/解析失败）静默返回 null，由调用方兜底，绝不阻断批改主流程。
 */
import { createAIClient, invokeStructured } from "@/lib/ai/client";
import { htmlToPlainText } from "@/lib/rich-text";

export interface ErrorAnalysis {
  error_analysis: string;      // 本次为什么错（针对性归因，简练）
  knowledge_explanation: string; // 相关知识点的正确讲解
  learning_suggestion: string;  // 可落地的复习/练习建议
}

const ERROR_ANALYSIS_SYSTEM_PROMPT = `你是一位严谨耐心的课程学习诊断专家。请基于题目、参考答案与学生的实际作答，指出学生"到底错在哪里"，并给出正确的知识点讲解与可执行的复习建议。

要求：
- error_analysis（错因分析）：一针见血指出学生错在哪一步/哪个概念，结合学生给出的作答说明，不要空话套话；50~160字。
- knowledge_explanation（知识点讲解）：针对该题对应的知识点做清晰、准确的讲解，帮学生真正搞懂；120~260字。
- learning_suggestion（学习建议）：给出 1~3 条具体、可马上执行的复习或练习建议；60~160字。

只输出一个合法 JSON 对象，格式：{"error_analysis":"...","knowledge_explanation":"...","learning_suggestion":"..."}，不要输出任何解释或 Markdown 代码块。`;

function plain(s: string | null | undefined): string {
  const t = String(s || '').trim();
  if (!t) return '';
  return /<(img|table|p|div|pre|ul|ol|h\d|br)[\s>]/i.test(t) ? htmlToPlainText(t) : t;
}

function truncate(s: string, max: number): string {
  const v = String(s || '');
  return v.length > max ? v.slice(0, max) + '…(已截断)' : v;
}

/**
 * 生成错因 AI 归因（best-effort，失败返回 null）。
 */
export async function generateErrorAnalysis(params: {
  content: string;          // 题目内容
  questionType: string;
  referenceAnswer: string;  // 参考答案
  studentAnswer: string;    // 学生作答
  errorType: string;        // wrong / incomplete / calculation_error ...
  knowledgePointName: string;
}): Promise<ErrorAnalysis | null> {
  const content = plain(params.content);
  const ref = plain(params.referenceAnswer);
  const ans = plain(params.studentAnswer);
  if (!content || !ans) return null;
  const userPrompt = `【题目】${truncate(content, 1500)}
【题型】${params.questionType || '—'}
【关联知识点】${params.knowledgePointName || '—'}
【错误类型】${params.errorType || 'wrong'}
【参考答案】${truncate(ref || '（未提供，请依据题意分析）', 1500)}
【学生作答】${truncate(ans, 1500)}

请判断错误成因并输出讲解与建议。`;

  try {
    const client = await createAIClient();
    const res = await invokeStructured<ErrorAnalysis>(client, ERROR_ANALYSIS_SYSTEM_PROMPT, userPrompt, 0.2);
    return {
      error_analysis: String(res?.error_analysis || '').trim(),
      knowledge_explanation: String(res?.knowledge_explanation || '').trim(),
      learning_suggestion: String(res?.learning_suggestion || '').trim(),
    };
  } catch (e) {
    console.error('generateErrorAnalysis 生成失败（静默返回空）:', e);
    return null;
  }
}