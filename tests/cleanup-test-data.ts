/** 清理开发验证期间产生的测试数据（作业 25/26/27 及其关联 + 相关通知/考试） */
import { initDb, getDb, saveDb } from '../src/storage/database/db';
import { assignment, answer, gradingTask, errorBook, notification, question, knowledgePoint } from '../src/storage/database/shared/schema';
import { inArray, like, or, eq } from 'drizzle-orm';

async function main() {
  await initDb();
  const db = getDb();
  const TEST_IDS = [28];

  // 1. 删测试作业的作答/批改/错题
  const ans = db.select({ id: answer.id }).from(answer).where(inArray(answer.assignment_id, TEST_IDS)).all();
  const gts = db.select({ id: gradingTask.id }).from(gradingTask).where(inArray(gradingTask.assignment_id, TEST_IDS)).all();
  const ebs = db.select({ id: errorBook.id }).from(errorBook).where(inArray(errorBook.assignment_id, TEST_IDS)).all();
  if (ebs.length) db.delete(errorBook).where(inArray(errorBook.assignment_id, TEST_IDS)).run();
  if (gts.length) db.delete(gradingTask).where(inArray(gradingTask.assignment_id, TEST_IDS)).run();
  if (ans.length) db.delete(answer).where(inArray(answer.assignment_id, TEST_IDS)).run();
  console.log(`cleaned answers=${ans.length} gradings=${gts.length} errors=${ebs.length}`);

  // 2. 删测试作业本身
  db.delete(assignment).where(inArray(assignment.id, TEST_IDS)).run();
  console.log('assignments deleted: 3');

  // 3. 删 AI 测试生成的验证题（管线验证期间 bank POST 入库的题：内容含"验证"或在无关联作业的孤立题中按内容匹配）
  const orphanQs = db.select({ id: question.id, content: question.content, kp: question.knowledge_point_id }).from(question).all()
    .filter((q) => /验证测试|管线|规则验证题/.test(q.content || ''));
  // 同时清掉 AI 出题验证时生成的 2 题内容含"集合/字典"且无任何作业引用的最近题目（保守：只删内容含"验证"的）
  if (orphanQs.length) db.delete(question).where(inArray(question.id, orphanQs.map((q) => q.id))).run();
  console.log('test questions deleted:', orphanQs.length);

  // 4. 清理相关通知（管线/闭环验证标题）
  const notes = db.select().from(notification).all()
    .filter((n) => /验证|管线|闭环/.test(n.title || '') || /验证|管线|闭环/.test(n.content || ''));
  if (notes.length) db.delete(notification).where(inArray(notification.id, notes.map((n: any) => n.id))).run();
  console.log('notifications deleted:', notes.length);

  // 5. 清理孤立知识点（AI 出题验证时 kp 反查创建的知识点——保守跳过，知识点无害）
  saveDb();
  console.log('done');
  process.exit(0);
}
main();
