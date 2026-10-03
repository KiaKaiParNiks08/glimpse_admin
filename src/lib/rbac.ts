export type AdminRoleName = 'super_admin' | 'event_admin';

export type AdminModule =
  | 'dashboard'
  | 'events'
  | 'venues'
  | 'explore-categories'
  | 'admins'
  | 'app-config'
  | 'app-themes';

export const MODULE_LABELS: Record<AdminModule, string> = {
  dashboard: 'Dashboard',
  admins: 'Admins',
  venues: 'Venues',
  events: 'Events',
  'explore-categories': 'Explore categories',
  'app-config': 'App configuration',
  'app-themes': 'App themes',
};

export const MODULE_HREFS: Record<AdminModule, string> = {
  dashboard: '/dashboard',
  admins: '/dashboard/admins',
  venues: '/dashboard/venues',
  events: '/dashboard/events',
  'explore-categories': '/dashboard/explore-categories',
  'app-config': '/dashboard/app-config',
  'app-themes': '/dashboard/app-themes',
};

/**
 * Single source of truth for RBAC.
 * - super_admin: full access
 * - event_admin: can manage events and related content, but NOT manage admins
 */
export const ROLE_MODULE_ACCESS: Record<AdminRoleName, AdminModule[]> = {
  super_admin: ['dashboard', 'admins', 'venues', 'events', 'explore-categories', 'app-config', 'app-themes'],
  event_admin: ['dashboard', 'venues', 'events', 'explore-categories'],
};

export function isAdminRole(role: string | null | undefined): role is AdminRoleName {
  return role === 'super_admin' || role === 'event_admin';
}

export function canAccessModule(role: string | null | undefined, module: AdminModule): boolean {
  if (!role) return false;
  if (!isAdminRole(role)) return false;
  return ROLE_MODULE_ACCESS[role].includes(module);
}

export function moduleFromPathname(pathname: string): AdminModule | null {
  if (!pathname || !pathname.startsWith('/dashboard')) return null;
  if (pathname === '/dashboard') return 'dashboard';
  if (pathname.startsWith('/dashboard/admins')) return 'admins';
  if (pathname.startsWith('/dashboard/venues')) return 'venues';
  if (pathname.startsWith('/dashboard/events')) return 'events';
  if (pathname.startsWith('/dashboard/explore-categories')) return 'explore-categories';
  if (pathname.startsWith('/dashboard/app-config')) return 'app-config';
  if (pathname.startsWith('/dashboard/app-themes')) return 'app-themes';
  return null;
}

