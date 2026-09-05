import { redirect } from 'next/navigation';

// 助教角色已从系统中移除，访问助教端一律跳回登录页
export default function AssistantLayout() {
  redirect('/');
}
