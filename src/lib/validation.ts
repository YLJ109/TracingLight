/**
 * API 统一参数校验工具
 * 修改说明：消除各 API 路由中分散的 parseInt NaN 风险、空值校验
 */

export interface ValidationResult<T> {
  valid: boolean;
  value?: T;
  error?: string;
}

/**
 * 安全解析整数，返回校验结果
 */
export function parseIntSafe(value: string | null | undefined): ValidationResult<number> {
  if (value === null || value === undefined || value === "") {
    return { valid: false, error: "参数缺失" };
  }
  const num = parseInt(value, 10);
  if (isNaN(num) || num <= 0) {
    return { valid: false, error: `无效的整数参数: ${value}` };
  }
  return { valid: true, value: num };
}

/**
 * 校验必填字符串
 */
export function validateRequired(value: string | null | undefined, fieldName: string): ValidationResult<string> {
  if (!value || value.trim() === "") {
    return { valid: false, error: `${fieldName}不能为空` };
  }
  return { valid: true, value: value.trim() };
}

/**
 * 校验枚举值
 */
export function validateEnum<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
  fieldName: string
): ValidationResult<T> {
  if (!value) {
    return { valid: false, error: `${fieldName}不能为空` };
  }
  if (!allowed.includes(value as T)) {
    return { valid: false, error: `${fieldName}无效值: ${value}，允许: ${allowed.join(", ")}` };
  }
  return { valid: true, value: value as T };
}

/**
 * 校验数字范围
 */
export function validateRange(value: number, min: number, max: number, fieldName: string): ValidationResult<number> {
  if (value < min || value > max) {
    return { valid: false, error: `${fieldName}必须在 ${min}-${max} 之间` };
  }
  return { valid: true, value };
}

/**
 * 统一错误响应
 */
export function validationErrorResponse(error: string): Response {
  return new Response(JSON.stringify({ success: false, error }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}
