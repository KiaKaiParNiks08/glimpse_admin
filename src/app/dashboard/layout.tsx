'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useRouteProgress } from '@/components/navigation/NavigationProvider';
import { ContentSkeleton } from '@/components/navigation/ContentSkeleton';
import { canAccessModule, moduleFromPathname, MODULE_HREFS, MODULE_LABELS, type AdminModule } from '@/lib/rbac';
import { setAdminJwtInSessionStorage } from '@/lib/admin-jwt-client';
import { signOutToLogin } from '@/lib/admin-sign-out';
import { getAdminTokenFromSessionAction, getMyProfileAction } from '@/app/actions/profile';
import styles from './dashboard.module.css';

function getInitials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';
}

function resolveAvatarSrc(avatarUrl?: string | null): string | null {
  if (!avatarUrl) return null;
  const value = avatarUrl.trim();
  if (!value) return null;
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  if (value.startsWith('/')) return value;
  // Stored media key/path fallback.
  return `/api/upload/signed?key=${encodeURIComponent(value)}`;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { pendingHref, navigate } = useRouteProgress();
  const pendingPath = pendingHref?.split('?')[0] ?? null;
  const [user, setUser] = useState<{ id: string; full_name: string; email: string; role_name: string; avatar_url?: string | null } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  function renderNavIcon(module: AdminModule) {
    switch (module) {
      case 'dashboard':
        return <path d="M3 13h8V3H3v10Zm10 8h8V11h-8v10ZM3 21h8v-6H3v6Zm10-10h8V3h-8v8Z" />;
      case 'events':
        return <path d="M7 2v2H5a2 2 0 0 0-2 2v3h18V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7Zm14 9H3v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8ZM7 15h4v4H7v-4Z" />;
      case 'venues':
        return <path d="M12 2 3 7v2h18V7l-9-5Zm-7 9h14v9h2v2H3v-2h2v-9Zm2 0v9h2v-9H7Zm4 0v9h2v-9h-2Zm4 0v9h2v-9h-2Z" />;
      case 'explore-categories':
        return <path d="M4 5h6v6H4V5Zm0 8h6v6H4v-6Zm10-8h6v6h-6V5Zm0 8h6v6h-6v-6Z" />;
      case 'admins':
        return <path d="M16 11a4 4 0 1 0-3.999-4A4 4 0 0 0 16 11ZM8 12a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4ZM8 14c-.29 0-.62.02-.97.05C5.62 14.24 2 14.94 2 17v3h4v-2c0-1.45.84-2.63 2.35-3.44A9.27 9.27 0 0 0 8 14Z" />;
      case 'app-config':
        return <path d="m19.14 12.94.04-.94-.04-.94 2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.6 7.6 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.49-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54c-.57.23-1.11.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58-.04.94.04.94-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.51.4 1.06.71 1.63.94l.36 2.54a.5.5 0 0 0 .49.42h3.84a.5.5 0 0 0 .49-.42l.36-2.54c.57-.23 1.11-.54 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z" />;
      case 'app-themes':
        return <path d="M12 2 4 6v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V6l-8-4Zm0 3.1L17 7.5v4.5c0 3.6-2.2 6.9-5 8-2.8-1.1-5-4.4-5-8V7.5l5-2.4Zm-2.8 5.4 1.4-1.4 1.4 1.4 1.4-1.4 1.4 1.4-1.4 1.4 1.4 1.4-1.4 1.4-1.4-1.4-1.4 1.4-1.4-1.4 1.4-1.4-1.4-1.4Z" />;
      default:
        return <circle cx="12" cy="12" r="8" />;
    }
  }

  useEffect(() => {
    const goToLogin = () => void signOutToLogin(router);
    getMyProfileAction()
      .then(async (res) => {
        if (!res.ok) {
          goToLogin();
          return;
        }
        // The cookie is the source of truth. Always copy its JWT into this tab: a new tab
        // has none, and an old tab may hold an expired one that the pages' API calls reject.
        const token = await getAdminTokenFromSessionAction();
        if (!token) {
          goToLogin();
          return;
        }
        setAdminJwtInSessionStorage(token);
        setUser({
          id: res.data.id,
          full_name: res.data.full_name,
          email: res.data.email,
          role_name: res.data.role_name,
          avatar_url: res.data.avatar_url,
        });
      })
      .catch(goToLogin);
  }, [router]);

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [user?.avatar_url, pathname]);

  useEffect(() => {
    if (!user) return;
    const currentModule = moduleFromPathname(pathname);
    if (!currentModule) return;
    if (!canAccessModule(user.role_name, currentModule)) {
      router.replace(MODULE_HREFS.dashboard);
    }
  }, [pathname, router, user]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    if (profileOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [profileOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem('dashboard_sidebar_collapsed');
    setSidebarCollapsed(saved === '1');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('dashboard_sidebar_collapsed', sidebarCollapsed ? '1' : '0');
  }, [sidebarCollapsed]);

  function handleSignOut() {
    void signOutToLogin(router);
  }

  if (user === null) {
    return (
      <div className={styles.wrapper}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarBrand}>
            <span>Glimpsapp Admin</span>
          </div>
        </aside>
        <div className={styles.mainArea}>
          <header className={styles.header} />
          <div className={styles.content}>
            <ContentSkeleton />
          </div>
        </div>
      </div>
    );
  }

  const navItems = (Object.keys(MODULE_HREFS) as Array<keyof typeof MODULE_HREFS>)
    .filter((m) => canAccessModule(user.role_name, m))
    .map((m) => ({ href: MODULE_HREFS[m], label: MODULE_LABELS[m], module: m }));
  const avatarSrc = resolveAvatarSrc(user.avatar_url);

  return (
    <div className={styles.wrapper}>
      <aside className={`${styles.sidebar} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
        <div className={styles.sidebarBrand}>
          {!sidebarCollapsed && <span>Glimpsapp Admin</span>}
          <button
            type="button"
            className={styles.collapseBtn}
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d={sidebarCollapsed ? 'M9 18l6-6-6-6' : 'M15 18l-6-6 6-6'} />
            </svg>
          </button>
        </div>
        <nav className={styles.sidebarNav}>
          {navItems.map((item) => {
            const pending = pendingPath === item.href;
            return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navLink} ${pathname === item.href || pending ? styles.navLinkActive : ''}`}
              title={sidebarCollapsed ? item.label : undefined}
              aria-busy={pending || undefined}
              aria-current={pathname === item.href ? 'page' : undefined}
            >
              <svg className={styles.navIcon} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                {renderNavIcon(item.module)}
              </svg>
              {!sidebarCollapsed && <span>{item.label}</span>}
            </Link>
            );
          })}
        </nav>
      </aside>

      <div className={styles.mainArea}>
        <header className={styles.header}>
          <div className={styles.profileWrap} ref={dropdownRef}>
            <button
              type="button"
              className={styles.profileTrigger}
              onClick={() => setProfileOpen((o) => !o)}
              aria-expanded={profileOpen}
              aria-haspopup="true"
            >
              {avatarSrc && !avatarLoadFailed ? (
                // eslint-disable-next-line @next/next/no-img-element -- dynamic profile image URL from backend
                <img
                  src={avatarSrc}
                  alt={user.full_name}
                  className={styles.avatarImg}
                  onError={() => setAvatarLoadFailed(true)}
                />
              ) : (
                <span className={styles.avatar}>{getInitials(user.full_name)}</span>
              )}
              <span className={styles.profileName}>{user.full_name}</span>
              <svg
                className={styles.chevron}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {profileOpen && (
              <div className={styles.dropdown}>
                <div className={styles.dropdownEmail}>{user.email}</div>
                <button
                  type="button"
                  className={styles.profileBtn}
                  onClick={() => {
                    setProfileOpen(false);
                    navigate('/dashboard/profile');
                  }}
                  aria-busy={pendingHref === '/dashboard/profile' || undefined}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" />
                  </svg>
                  Profile
                </button>
                <button
                  type="button"
                  className={styles.profileBtn}
                  onClick={() => {
                    setProfileOpen(false);
                    navigate('/dashboard/change-password');
                  }}
                  aria-busy={pendingHref === '/dashboard/change-password' || undefined}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="10" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  Change password
                </button>
                <button
                  type="button"
                  className={styles.logoutBtn}
                  onClick={handleSignOut}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Log out
                </button>
              </div>
            )}
          </div>
        </header>

        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
