// 公告发布已内嵌至「学情看板」(teacher/analytics)，此路由保留仅为兼容旧书签，统一重定向到学情看板。
import { redirect } from 'next/navigation';

export default function LegacyTeacherAnnouncementsRedirect() {
  redirect('/teacher/analytics');
}