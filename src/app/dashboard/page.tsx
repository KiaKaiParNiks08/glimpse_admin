'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminBearerAuthHeader } from '@/lib/admin-jwt-client';
import { signOutToLogin } from '@/lib/admin-sign-out';
import { DashboardCharts } from './DashboardCharts';

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

  if (user === null) {
    return (
      <p style={{ color: '#94a3b8' }}>Loading…</p>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', color: '#f8fafc', marginBottom: '0.5rem' }}>
        Dashboard
      </h1>
      <p style={{ color: '#94a3b8', marginBottom: '1rem' }}>
        Welcome back. You’re signed in as <strong style={{ color: '#e2e8f0' }}>{user.full_name}</strong>.
      </p>

      <DashboardCharts />
    </div>
  );
}
