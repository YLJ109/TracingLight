import { relations } from "drizzle-orm";
import {
  school, college, major, classInfo, user, course,
  knowledgePoint, knowledgeGraphNode, knowledgeGraphEdge,
  question, assignment, answer, gradingTask, errorBook,
  knowledgeMasteryLog, questionRecord, announcement, announcementRead,
  studentSchedule, classSchedule, examSchedule, studyPlan, studySession,
} from "./schema";

// ===================== 基础数据层关系 =====================

export const collegeRelations = relations(college, ({ one, many }) => ({
  school: one(school, { fields: [college.school_id], references: [school.id] }),
  majors: many(major),
}));

export const majorRelations = relations(major, ({ one, many }) => ({
  college: one(college, { fields: [major.college_id], references: [college.id] }),
  classes: many(classInfo),
}));

export const classInfoRelations = relations(classInfo, ({ one, many }) => ({
  major: one(major, { fields: [classInfo.major_id], references: [major.id] }),
  users: many(user),
  courses: many(course),
}));

export const userRelations = relations(user, ({ one, many }) => ({
  class: one(classInfo, { fields: [user.class_id], references: [classInfo.id] }),
  taughtCourses: many(course, { relationName: "teacher" }),
  assignments: many(assignment, { relationName: "teacherAssignments" }),
  answers: many(answer, { relationName: "studentAnswers" }),
  gradingTasks: many(gradingTask, { relationName: "studentGradingTasks" }),
  errorBooks: many(errorBook),
  knowledgeMasteryLogs: many(knowledgeMasteryLog),
}));

export const courseRelations = relations(course, ({ one, many }) => ({
  teacher: one(user, { fields: [course.teacher_id], references: [user.id], relationName: "teacher" }),
  class: one(classInfo, { fields: [course.class_id], references: [classInfo.id] }),
  knowledgePoints: many(knowledgePoint),
  questions: many(question),
  assignments: many(assignment),
}));

// ===================== 教学资源层关系 =====================

export const knowledgePointRelations = relations(knowledgePoint, ({ one, many }) => ({
  course: one(course, { fields: [knowledgePoint.course_id], references: [course.id] }),
  parent: one(knowledgePoint, { fields: [knowledgePoint.parent_id], references: [knowledgePoint.id] }),
  children: many(knowledgePoint, { relationName: "parent" }),
  questions: many(question),
}));

export const knowledgeGraphNodeRelations = relations(knowledgeGraphNode, ({ one, many }) => ({
  knowledgePoint: one(knowledgePoint, { fields: [knowledgeGraphNode.knowledge_point_id], references: [knowledgePoint.id] }),
  course: one(course, { fields: [knowledgeGraphNode.course_id], references: [course.id] }),
  parent: one(knowledgeGraphNode, { fields: [knowledgeGraphNode.parent_node_id], references: [knowledgeGraphNode.id] }),
  children: many(knowledgeGraphNode, { relationName: "parentNode" }),
  fromEdges: many(knowledgeGraphEdge, { relationName: "fromNode" }),
  toEdges: many(knowledgeGraphEdge, { relationName: "toNode" }),
}));

export const knowledgeGraphEdgeRelations = relations(knowledgeGraphEdge, ({ one }) => ({
  fromNode: one(knowledgeGraphNode, { fields: [knowledgeGraphEdge.from_node_id], references: [knowledgeGraphNode.id], relationName: "fromNode" }),
  toNode: one(knowledgeGraphNode, { fields: [knowledgeGraphEdge.to_node_id], references: [knowledgeGraphNode.id], relationName: "toNode" }),
}));

export const questionRelations = relations(question, ({ one, many }) => ({
  course: one(course, { fields: [question.course_id], references: [course.id] }),
  knowledgePoint: one(knowledgePoint, { fields: [question.knowledge_point_id], references: [knowledgePoint.id] }),
  answers: many(answer),
  gradingTasks: many(gradingTask),
}));

// ===================== 业务流转层关系 =====================

export const assignmentRelations = relations(assignment, ({ one, many }) => ({
  course: one(course, { fields: [assignment.course_id], references: [course.id] }),
  teacher: one(user, { fields: [assignment.teacher_id], references: [user.id], relationName: "teacherAssignments" }),
  answers: many(answer),
  gradingTasks: many(gradingTask),
}));

export const answerRelations = relations(answer, ({ one, many }) => ({
  assignment: one(assignment, { fields: [answer.assignment_id], references: [assignment.id] }),
  student: one(user, { fields: [answer.student_id], references: [user.id], relationName: "studentAnswers" }),
  question: one(question, { fields: [answer.question_id], references: [question.id] }),
  gradingTasks: many(gradingTask),
}));

export const gradingTaskRelations = relations(gradingTask, ({ one, many }) => ({
  answer: one(answer, { fields: [gradingTask.answer_id], references: [answer.id] }),
  assignment: one(assignment, { fields: [gradingTask.assignment_id], references: [assignment.id] }),
  student: one(user, { fields: [gradingTask.student_id], references: [user.id], relationName: "studentGradingTasks" }),
  question: one(question, { fields: [gradingTask.question_id], references: [question.id] }),
  knowledgePoint: one(knowledgePoint, { fields: [gradingTask.knowledge_point_id], references: [knowledgePoint.id] }),
  errorBooks: many(errorBook),
}));

export const errorBookRelations = relations(errorBook, ({ one }) => ({
  student: one(user, { fields: [errorBook.student_id], references: [user.id] }),
  question: one(question, { fields: [errorBook.question_id], references: [question.id] }),
  knowledgePoint: one(knowledgePoint, { fields: [errorBook.knowledge_point_id], references: [knowledgePoint.id] }),
  assignment: one(assignment, { fields: [errorBook.assignment_id], references: [assignment.id] }),
  gradingTask: one(gradingTask, { fields: [errorBook.grading_task_id], references: [gradingTask.id] }),
}));

export const knowledgeMasteryLogRelations = relations(knowledgeMasteryLog, ({ one }) => ({
  student: one(user, { fields: [knowledgeMasteryLog.student_id], references: [user.id] }),
  knowledgePoint: one(knowledgePoint, { fields: [knowledgeMasteryLog.knowledge_point_id], references: [knowledgePoint.id] }),
}));

// ===================== 互动管理层关系 =====================

export const questionRecordRelations = relations(questionRecord, ({ one }) => ({
  student: one(user, { fields: [questionRecord.student_id], references: [user.id] }),
  teacher: one(user, { fields: [questionRecord.teacher_id], references: [user.id] }),
  course: one(course, { fields: [questionRecord.course_id], references: [course.id] }),
  knowledgePoint: one(knowledgePoint, { fields: [questionRecord.knowledge_point_id], references: [knowledgePoint.id] }),
  errorRecord: one(errorBook, { fields: [questionRecord.error_record_id], references: [errorBook.id] }),
  assignment: one(assignment, { fields: [questionRecord.assignment_id], references: [assignment.id] }),
}));

export const announcementRelations = relations(announcement, ({ one, many }) => ({
  teacher: one(user, { fields: [announcement.teacher_id], references: [user.id] }),
  course: one(course, { fields: [announcement.course_id], references: [course.id] }),
  reads: many(announcementRead),
}));

export const announcementReadRelations = relations(announcementRead, ({ one }) => ({
  announcement: one(announcement, { fields: [announcementRead.announcement_id], references: [announcement.id] }),
  student: one(user, { fields: [announcementRead.student_id], references: [user.id] }),
}));

// ===================== 学习规划层关系 =====================

export const studentScheduleRelations = relations(studentSchedule, ({ one }) => ({
  student: one(user, { fields: [studentSchedule.student_id], references: [user.id] }),
}));

export const classScheduleRelations = relations(classSchedule, ({ one }) => ({
  course: one(course, { fields: [classSchedule.course_id], references: [course.id] }),
  class: one(classInfo, { fields: [classSchedule.class_id], references: [classInfo.id] }),
}));

export const examScheduleRelations = relations(examSchedule, ({ one }) => ({
  course: one(course, { fields: [examSchedule.course_id], references: [course.id] }),
  class: one(classInfo, { fields: [examSchedule.class_id], references: [classInfo.id] }),
}));

export const studyPlanRelations = relations(studyPlan, ({ one, many }) => ({
  student: one(user, { fields: [studyPlan.student_id], references: [user.id] }),
  sessions: many(studySession),
}));

export const studySessionRelations = relations(studySession, ({ one }) => ({
  plan: one(studyPlan, { fields: [studySession.plan_id], references: [studyPlan.id] }),
  knowledgePoint: one(knowledgePoint, { fields: [studySession.knowledge_point_id], references: [knowledgePoint.id] }),
}));
