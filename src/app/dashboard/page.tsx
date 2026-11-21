'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { adminBearerAuthHeader } from '@/lib/admin-jwt-client';
import { signOutToLogin } from '@/lib/admin-sign-out';
import { useAdminAccess } from '@/components/auth/AdminAccessContext';
import { DashboardCharts } from './DashboardCharts';
import { ContentSkeleton } from '@/components/navigation/ContentSkeleton';
import { PageHeader } from '@/components/ui/PageHeader';

export default function DashboardPage() {
  const router = useRouter();
  const { access } = useAdminAccess();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!access) return;
    const headers = adminBearerAuthHeader();
    if (!headers.Authorization) {
      void signOutToLogin(router);
    }
  }, [access, router]);

  return (
    <div>
      {!access ? (
        <ContentSkeleton variant="cards" />
      ) : (
        <>
          <PageHeader
            title="Dashboard"
            description={`Welcome back, ${access.full_name}. Here is an overview of your events, system activity, and analytics.`}
            breadcrumbs={[{ label: 'Admin', href: '/dashboard' }, { label: 'Dashboard' }]}
          />
          <DashboardCharts />
        </>
      )}
    </div>
  );
}
