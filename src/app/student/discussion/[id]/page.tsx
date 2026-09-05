'use client';

import { useParams, useSearchParams } from 'next/navigation';
import DiscussionDetail from '@/components/discussion-detail';

export default function StudentDiscussionDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('course_id');
  const backHref = `/student/discussion${courseId ? `?course_id=${courseId}` : ''}`;
  return <DiscussionDetail postId={String(params?.id ?? '')} backHref={backHref} />;
}