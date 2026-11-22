'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useRouteProgress } from '@/components/navigation/NavigationProvider';
import { ContentSkeleton } from '@/components/navigation/ContentSkeleton';
import {
  canAccessModule,
  formatRoleDisplayName,
  moduleFromPathname,
  MODULE_HREFS,
  MODULE_LABELS,
  type AdminModule,
} from '@/lib/rbac';
import { setAdminJwtInSessionStorage } from '@/lib/admin-jwt-client';
import { signOutToLogin } from '@/lib/admin-sign-out';
import { getAdminTokenFromSessionAction, getMyProfileAction } from '@/app/actions/profile';
import type { ClientAdminAccess } from '@/server/access';
import { AdminAccessProvider } from '@/components/auth/AdminAccessContext';
import { DashboardUploadProvider } from '@/components/upload/DashboardUploadProvider';
import { UploadProgressDock } from '@/components/upload/UploadProgressDock';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { SidebarArtwork } from '@/components/ui/SidebarArtwork';
import {
  LayoutDashboard,
  Calendar,
  Bell,
  Building2,
  Compass,
  Users,
  CreditCard,
  Settings,
  Palette,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  UserCheck,
  Key,
  LogOut,
  Sparkles,
} from '@/components/icons';
import styles from './dashboard.module.css';

function getInitials(fullName: string): string {
  return (
    fullName
      .trim()
      .split(/\s+/)
      .map((s) => s[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

function resolveAvatarSrc(avatarUrl?: string | null): string | null {
  if (!avatarUrl) return null;
  const value = avatarUrl.trim();
  if (!value) return null;
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  if (value.startsWith('/')) return value;
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
  const [user, setUser] = useState<{
    id: string;
    full_name: string;
    email: string;
    role_name: string;
    avatar_url?: string | null;
  } | null>(null);
  const [userAccess, setUserAccess] = useState<ClientAdminAccess | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  function renderNavIcon(module: AdminModule) {
    switch (module) {
      case 'dashboard':
        return <LayoutDashboard size={18} className={styles.navIcon} />;
      case 'events':
        return <Calendar size={18} className={styles.navIcon} />;
      case 'notifications':
        return <Bell size={18} className={styles.navIcon} />;
      case 'venues':
        return <Building2 size={18} className={styles.navIcon} />;
      case 'explore-categories':
        return <Compass size={18} className={styles.navIcon} />;
      case 'admins':
        return <Users size={18} className={styles.navIcon} />;
      case 'plans':
        return <CreditCard size={18} className={styles.navIcon} />;
      case 'app-config':
        return <Settings size={18} className={styles.navIcon} />;
      case 'app-themes':
        return <Palette size={18} className={styles.navIcon} />;
      default:
        return <Sparkles size={18} className={styles.navIcon} />;
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
        const token = res.data.token ?? (await getAdminTokenFromSessionAction());
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
        setUserAccess(res.data.access ?? null);
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
    const allowed = userAccess
      ? userAccess.modules.includes(currentModule)
      : canAccessModule(user.role_name, currentModule);
    if (!allowed) {
      router.replace(MODULE_HREFS.dashboard);
    }
  }, [pathname, router, user, userAccess]);

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
            <div className={styles.brandLogo}>
              <div className={styles.logoIcon}>G</div>
              <div className={styles.brandTitleWrap}>
                <span className={styles.brandTitle}>Glimpse Admin</span>
                <span className={styles.brandSubtitle}>Event Platform</span>
              </div>
            </div>
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
    .filter((m) =>
      userAccess ? userAccess.modules.includes(m) : canAccessModule(user.role_name, m)
    )
    .map((m) => ({ href: MODULE_HREFS[m], label: MODULE_LABELS[m], module: m }));
  const avatarSrc = resolveAvatarSrc(user.avatar_url);

  const currentModule = moduleFromPathname(pathname);
  const currentModuleName = currentModule ? MODULE_LABELS[currentModule] : 'Dashboard';

  return (
    <AdminAccessProvider access={userAccess}>
      <DashboardUploadProvider>
        <div className={styles.wrapper}>
          <aside className={`${styles.sidebar} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
            <div className={styles.sidebarBrand}>
              <Link href="/dashboard" className={styles.brandLogo}>
                <div className={styles.logoIcon}>G</div>
                {!sidebarCollapsed && (
                  <div className={styles.brandTitleWrap}>
                    <span className={styles.brandTitle}>Glimpse Admin</span>
                    <span className={styles.brandSubtitle}>Event Platform</span>
                  </div>
                )}
              </Link>
              <button
                type="button"
                className={styles.collapseBtn}
                onClick={() => setSidebarCollapsed((v) => !v)}
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {sidebarCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
              </button>
            </div>
            <nav className={styles.sidebarNav}>
              {navItems.map((item) => {
                const pending = pendingPath === item.href;
                const active = pathname === item.href || pending;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${styles.navLink} ${active ? styles.navLinkActive : ''}`}
                    title={sidebarCollapsed ? item.label : undefined}
                    aria-busy={pending || undefined}
                    aria-current={pathname === item.href ? 'page' : undefined}
                  >
                    {renderNavIcon(item.module)}
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </nav>
            <SidebarArtwork collapsed={sidebarCollapsed} />
          </aside>

          <div className={`${styles.mainArea} ${sidebarCollapsed ? styles.mainAreaCollapsed : ''}`}>
            <header className={styles.header}>
              <div className={styles.headerLeft}>
                <div className={styles.currentModuleLabel}>
                  <span>{currentModuleName}</span>
                </div>
              </div>

              <div className={styles.headerRight}>
                <ThemeToggle />

                <div className={styles.profileWrap} ref={dropdownRef}>
                  <button
                    type="button"
                    className={styles.profileTrigger}
                    onClick={() => setProfileOpen((o) => !o)}
                    aria-expanded={profileOpen}
                    aria-haspopup="true"
                  >
                    {avatarSrc && !avatarLoadFailed ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarSrc}
                        alt={user.full_name}
                        className={styles.avatarImg}
                        onError={() => setAvatarLoadFailed(true)}
                      />
                    ) : (
                      <span className={styles.avatar}>{getInitials(user.full_name)}</span>
                    )}
                    <div className={styles.profileInfo}>
                      <span className={styles.profileName}>{user.full_name}</span>
                      <span className={styles.profileRole}>{formatRoleDisplayName(user.role_name)}</span>
                    </div>
                    <ChevronDown size={14} className={styles.chevron} />
                  </button>
                  {profileOpen && (
                    <div className={styles.dropdown}>
                      <div className={styles.dropdownHeader}>
                        <div className={styles.dropdownEmail}>{user.email}</div>
                        <div className={styles.dropdownSub}>
                          {formatRoleDisplayName(user.role_name)}
                          {userAccess?.purchase_plan_name ? ` · ${userAccess.purchase_plan_name}` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={styles.profileBtn}
                        onClick={() => {
                          setProfileOpen(false);
                          navigate('/dashboard/profile');
                        }}
                        aria-busy={pendingHref === '/dashboard/profile' || undefined}
                      >
                        <UserCheck size={16} />
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
                        <Key size={16} />
                        Change password
                      </button>
                      <button
                        type="button"
                        className={styles.logoutBtn}
                        onClick={handleSignOut}
                      >
                        <LogOut size={16} />
                        Log out
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </header>

            <main className={styles.content}>{children}</main>
          </div>
          <UploadProgressDock />
        </div>
      </DashboardUploadProvider>
    </AdminAccessProvider>
  );
}
