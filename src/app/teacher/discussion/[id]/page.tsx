'use client';

import { useParams, useSearchParams } from 'next/navigation';
import DiscussionDetail from '@/components/discussion-detail';
import { SetActiveNav } from '@/components/app-shell';

export default function TeacherDiscussionDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('course_id');
  const backHref = `/teacher/discussion${courseId ? `?course_id=${courseId}` : ''}`;
  return (
    <>
      <SetActiveNav href="/teacher/analytics" />
      <DiscussionDetail postId={String(params?.id ?? '')} backHref={backHref} />
    </>
  );
}