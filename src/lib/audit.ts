/**
 * 审计日志统一写入口。
 * 抽取「读 aardio」「写 audit_log」为共享函数，供登录、教务、管理模块复用。
 * 埋点一律 try/catch 静默：审计失败绝不影响主流程与返回结构。
 */
import { getDb } from '@/storage/database/db';
import { auditLog } from '@/storage/database/shared/schema';

export interface WriteAuditParams {
  /** 操作者 id（可空：如登出前的匿名场景） */
  operatorId?: number | null;
  /** 操作者名（可空） */
  operatorName?: string | null;
  /** 操作行为标识，如 create_user / exam_grades_published */
  action: string;
  /** 对象类型，如 user / assignment / exam / announcement */
  targetType?: string | null;
  /** 对象 id（字符串） */
  targetId?: string | number | null;
  /** 中文描述，如「发布作业《期中测试》」 */
  detail?: string | null;
}

/** 写一条审计日志；任何异常静默忽略，不影响主流程 */
export async function writeAudit(params: WriteAuditParams): Promise<void> {
  try {
    const db = getDb();
    await db.insert(auditLog).values({
      operator_id: params.operatorId ?? null,
      operator_name: params.operatorName ?? null,
      action: params.action,
      target_type: params.targetType ?? null,
      target_id: params.targetId == null ? null : String(params.targetId),
      detail: params.detail ?? null,
    }).execute();
  } catch (e) {
    // 审计失败不抛错，仅打印到服务端日志以便排查
    console.error('writeAudit error:', e);
  }
}