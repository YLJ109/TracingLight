/**
 * 阅读投入统一计分（唯一口径）
 * - 阅读时长由秒折算为分钟：向下取整（floor），避免四舍五入高估阅读时长。
 * - 每 60 分钟记 10 分，封顶 25 分。
 * 供「参与分(participation.service)」「今日学习(today API)」「前端实时反馈(learn 页)」共用，
 * 避免各处重复实现导致口径漂移。
 */
export function readingMinutesFromSeconds(seconds: number): number {
  return Math.floor(Math.max(0, seconds) / 60);
}
export function readingScoreFromMinutes(minutes: number): number {
  return Math.min(25, Math.round((Math.max(0, minutes) / 60) * 10));
}