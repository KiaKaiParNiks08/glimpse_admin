import { redirect } from 'next/navigation';
import { getAdminSessionFromCookies } from '@/lib/admin-session';
import type { ReactNode } from 'react';

export default async function LoginLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getAdminSessionFromCookies();

  // If already authenticated, don't allow accessing /login.
  if (session) redirect('/dashboard');

  return children;
}

