/** 为课程 2/3/4 补充能力/思政图谱数据（幂等：已有则跳过） */
import { initDb, getDb, saveDb } from '../src/storage/database/db';
import { abilityPoint, ideologyPoint, abilityKnowledge, ideologyKnowledge, knowledgePoint } from '../src/storage/database/shared/schema';
import { eq } from 'drizzle-orm';

const ABILITY_TEMPLATES: Array<[string, string]> = [
  ['计算思维', '将问题抽象为可计算模型的思维能力'],
  ['逻辑推理', '程序逻辑与流程控制推理能力'],
  ['实践应用', '知识迁移与动手实践能力'],
  ['协作表达', '团队协作与技术表达能力'],
];
const IDEOLOGY_TEMPLATES: Array<[string, string]> = [
  ['科学精神', '求真务实、严谨治学'],
  ['工程伦理', '技术应用的伦理与责任意识'],
  ['创新意识', '勇于探索、开拓创新'],
  ['职业素养', '规范意识与精益求精的工匠精神'],
];

async function main() {
  await initDb();
  const db = getDb();
  const maxAbility = db.select({ id: abilityPoint.id }).from(abilityPoint).all().reduce((m, r) => Math.max(m, r.id), 0);
  const maxIdeo = db.select({ id: ideologyPoint.id }).from(ideologyPoint).all().reduce((m, r) => Math.max(m, r.id), 0);
  let aid = maxAbility, iid = maxIdeo;
  let inserted = 0;
  for (const courseId of [2, 3, 4]) {
    const hasAbility = db.select({ id: abilityPoint.id }).from(abilityPoint).where(eq(abilityPoint.course_id, courseId)).all();
    const hasIdeo = db.select({ id: ideologyPoint.id }).from(ideologyPoint).where(eq(ideologyPoint.course_id, courseId)).all();
    const kps = db.select({ id: knowledgePoint.id }).from(knowledgePoint).where(eq(knowledgePoint.course_id, courseId)).all();
    const kpIds = kps.map((k) => k.id);
    if (hasAbility.length === 0 && kpIds.length > 0) {
      ABILITY_TEMPLATES.forEach(([name, desc], i) => {
        aid++;
        db.insert(abilityPoint).values({ id: aid, name, description: desc, course_id: courseId }).run();
        // 关联该课程前 3 个知识点
        kpIds.slice(0, 3).forEach((kid) => {
          db.insert(abilityKnowledge).values({ ability_id: aid, knowledge_id: kid }).run();
        });
        inserted++;
      });
    }
    if (hasIdeo.length === 0 && kpIds.length > 0) {
      IDEOLOGY_TEMPLATES.forEach(([name, desc], i) => {
        iid++;
        db.insert(ideologyPoint).values({ id: iid, name, description: desc, course_id: courseId }).run();
        kpIds.slice(0, 2).forEach((kid) => {
          db.insert(ideologyKnowledge).values({ ideology_id: iid, knowledge_id: kid }).run();
        });
        inserted++;
      });
    }
  }
  console.log('inserted ability/ideology rows:', inserted);
  saveDb();
  process.exit(0);
}
main();
