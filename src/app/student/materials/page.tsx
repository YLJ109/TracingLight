// 旧学习材料页已并入「今日学习」(learn)，此路由保留仅为兼容旧书签/旧入口，统一重定向到 /student/learn。
// 带 knowledge_point_id 时跳转过去会自动在页内打开对应材料。
import { redirect } from 'next/navigation';

export default async function LegacyMaterialsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const kpId = Array.isArray(sp.knowledge_point_id) ? sp.knowledge_point_id[0] : sp.knowledge_point_id;
  const q = kpId ? `?knowledge_point_id=${encodeURIComponent(kpId)}` : '';
  redirect(`/student/learn${q}`);
}