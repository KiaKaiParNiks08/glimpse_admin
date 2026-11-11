'use client';

import { use } from 'react';
import { PushNotificationSender } from '@/components/notifications/PushNotificationSender';

export default function EventNotificationsPage({
  params,
}: {
  params: Promise<{ event_id: string }>;
}) {
  const { event_id } = use(params);
  return <PushNotificationSender lockedEventId={event_id} />;
}
