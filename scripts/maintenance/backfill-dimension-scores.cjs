/**
 * backfill-dimension-scores.cjs
 * 维护脚本：为历史已完成但缺失 dimension_scores 的批改记录回填六维能力分。
 * - 客观题：全对→知识/逻辑=100，表达=100；半对/错→知识/逻辑=round(total/full*100)；拓展=0（客观题无拓展数据）
 * - 主观题：暂无逐维明细，以得分率 round(total/full*100) 作为四维一致兜底
 * 幂等：仅处理 status='completed' 且 dimension_scores IS NULL 的记录。
 *
 * 用法：node scripts/maintenance/backfill-dimension-scores.cjs
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// 从 .env 读取 DATABASE_URL（避免依赖 dotenv）
function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(__dirname, '..', '..', '.env');
  try {
    const text = fs.readFileSync(envPath, 'utf8');
    const line = text.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
    if (line) {
      const value = line.slice('DATABASE_URL='.length).trim();
      // 去掉可能的引号与行尾注释
      return value.replace(/^["']|["']$/g, '').split(/\s+#/)[0].trim();
    }
  } catch { /* 忽略，回退默认值 */ }
  return 'postgres://tracinglight:tracinglight_pw@localhost:5433/tracinglight';
}

const OBJECTIVE_TYPES = ['single_choice', 'judgment', 'multiple_choice', 'multi_choice', 'fill_blank', 'true_false'];

async function main() {
  const pool = new Pool({ connectionString: loadDatabaseUrl() });
  const { rows } = await pool.query(
    "select id, question_type, total_score, full_score from grading_task where status='completed' and dimension_scores is null"
  );
  console.log(`待回填批改数: ${rows.length}`);
  if (rows.length === 0) {
    console.log('无缺失记录，无需处理。');
    await pool.end();
    return;
  }

  let done = 0;
  for (const r of rows) {
    const full = Number(r.full_score) || 0;
    const total = Number(r.total_score) || 0;
    const ratio = full > 0 ? Math.min(100, Math.max(0, Math.round((total / full) * 100))) : 0;
    const dims = OBJECTIVE_TYPES.includes(r.question_type)
      ? {
          knowledge_accuracy: total >= full ? 100 : ratio,
          logic_completeness: total >= full ? 100 : ratio,
          expression_clarity: 100,
          expansion: 0,
        }
      : {
          knowledge_accuracy: ratio,
          logic_completeness: ratio,
          expression_clarity: ratio,
          expansion: ratio,
        };
    await pool.query('update grading_task set dimension_scores = $1 where id = $2', [JSON.stringify(dims), r.id]);
    done++;
  }

  const { rows: chk } = await pool.query(
    "select count(*)::int as c from grading_task where status='completed' and dimension_scores is null"
  );
  console.log(`已回填: ${done} | 回填后仍缺失: ${chk[0].c}`);
  await pool.end();
}

main().catch((e) => {
  console.error('回填失败:', e.message);
  process.exit(1);
});