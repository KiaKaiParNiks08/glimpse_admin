'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PushNotificationSender } from '@/components/notifications/PushNotificationSender';

function NotificationsPageInner() {
  const searchParams = useSearchParams();
  const eventId = searchParams.get('eventId')?.trim() || undefined;
  return <PushNotificationSender lockedEventId={eventId} />;
}

export default function NotificationsPage() {
  return (
    <Suspense fallback={<div style={{ padding: '1rem', color: '#64748b' }}>Loading notifications...</div>}>
      <NotificationsPageInner />
    </Suspense>
  );
}
