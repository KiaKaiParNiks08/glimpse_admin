'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { adminBearerAuthHeader } from '@/lib/admin-jwt-client';
import { signOutToLogin } from '@/lib/admin-sign-out';
import { useAdminAccess } from '@/components/auth/AdminAccessContext';
import { DashboardCharts } from './DashboardCharts';
import { ContentSkeleton } from '@/components/navigation/ContentSkeleton';

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
          <h1 style={{ fontSize: '1.5rem', color: '#0f172a', marginBottom: '0.5rem' }}>
            Dashboard
          </h1>
          <p style={{ color: '#64748b', marginBottom: '1rem' }}>
            Welcome back. You’re signed in as <strong style={{ color: '#0f172a' }}>{access.full_name}</strong>.
          </p>
          <DashboardCharts />
        </>
      )}
    </div>
  );
}
