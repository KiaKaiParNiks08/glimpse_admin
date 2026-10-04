'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminBearerAuthHeader } from '@/lib/admin-jwt-client';
import { signOutToLogin } from '@/lib/admin-sign-out';
import { DashboardCharts } from './DashboardCharts';
import { ContentSkeleton } from '@/components/navigation/ContentSkeleton';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ id: string; full_name: string; email: string; role_name: string } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const headers = adminBearerAuthHeader();
    if (!headers.Authorization) {
      void signOutToLogin(router);
      return;
    }

    fetch('/api/admin/me', { headers })
      .then(async (r) => {
        if (!r.ok) throw new Error('NOT_AUTH');
        type AdminUser = { id: string; full_name: string; email: string; role_name: string };
        type AdminMeJson = {
          data?: { user?: AdminUser } | null;
          user?: AdminUser;
        };
        const json = (await r.json()) as AdminMeJson;
        setUser(json.data?.user ?? json.user ?? null);
      })
      .catch(() => void signOutToLogin(router));
  }, [router]);

  return (
    <div>
      {user === null ? (
        <ContentSkeleton variant="cards" />
      ) : (
        <>
          <h1 style={{ fontSize: '1.5rem', color: '#0f172a', marginBottom: '0.5rem' }}>
            Dashboard
          </h1>
          <p style={{ color: '#64748b', marginBottom: '1rem' }}>
            Welcome back. You’re signed in as <strong style={{ color: '#0f172a' }}>{user.full_name}</strong>.
          </p>
          <DashboardCharts />
        </>
      )}
    </div>
  );
}
