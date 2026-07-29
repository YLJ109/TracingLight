/**
 * 业务日志工具 - 统一结构化日志
 *
 * 使用方式：
 *   import { logger } from '@/lib/logger';
 *   logger.info('module:assignments', '作业创建成功', { assignmentId: 1 });
 *   logger.error('module:ai', 'AI批改失败', error);
 *
 * 生产环境可通过 NODE_ENV 控制日志级别
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  module: string;
  message: string;
  timestamp: string;
  data?: unknown;
  error?: string;
}

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function getMinLevel(): LogLevel {
  if (process.env.NODE_ENV === 'production') return 'warn';
  return 'debug';
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[getMinLevel()];
}

function formatEntry(entry: LogEntry): string {
  const parts = [`[${entry.level.toUpperCase()}]`, entry.timestamp, entry.module, entry.message];
  if (entry.data) parts.push(JSON.stringify(entry.data));
  if (entry.error) parts.push(`| Error: ${entry.error}`);
  return parts.join(' ');
}

function log(level: LogLevel, module: string, message: string, data?: unknown): void {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    level,
    module,
    message,
    timestamp: new Date().toISOString(),
    data,
    error: data instanceof Error ? data.message : undefined,
  };

  const formatted = formatEntry(entry);

  switch (level) {
    case 'error':
      console.error(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    default:
      console.log(formatted);
  }
}

export const logger = {
  debug: (module: string, message: string, data?: unknown) => log('debug', module, message, data),
  info: (module: string, message: string, data?: unknown) => log('info', module, message, data),
  warn: (module: string, message: string, data?: unknown) => log('warn', module, message, data),
  error: (module: string, message: string, data?: unknown) => log('error', module, message, data),
};
