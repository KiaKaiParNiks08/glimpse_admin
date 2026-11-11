/**
 * Centralized Role, Permission, Purchase Plan Feature, and Module Access definitions.
 * Safe for both server and client bundles (zero database imports).
 */

export type RoleScope = 'platform' | 'tenant' | 'guest';

export type AdminTier = 'super_admin' | 'super_staff' | 'client_admin' | 'client_subuser';

export const FEATURE_KEYS = [
  'event_basic',
  'event_sessions',
  'event_team',
  'session_media_upload',
  'event_watermark',
  'ai_recognition',
  'event_explore',
  'event_highlights',
  'event_qr',
  'event_current_happening',
  'event_post_report',
  'event_guests_export',
  'push_notifications',
  'mobile_favorites',
  'mobile_feed',
  'venues_manage',
  'app_themes_manage',
  'explore_categories_manage',
  'sub_users_manage',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type FeatureMap = Record<FeatureKey, boolean>;

export const FEATURE_CATALOG: Array<{
  key: FeatureKey;
  label: string;
  description: string;
  group: 'event' | 'media_ai' | 'mobile' | 'workspace';
}> = [
  { key: 'event_basic', label: 'Core Event Creation & Settings', description: 'Create/edit events, dates, category, cover photos, and e-invite PDF', group: 'event' },
  { key: 'event_sessions', label: 'Days & Sessions', description: 'Manage event days, session schedules, offerings, and session organizer', group: 'event' },
  { key: 'event_team', label: 'Planner & Photographer Team Data', description: 'Add event planner & photographer contacts in Step 4', group: 'event' },
  { key: 'session_media_upload', label: 'Session Media & Folder Upload', description: 'Upload, organize, and manage photos/videos inside sessions', group: 'media_ai' },
  { key: 'event_watermark', label: 'Gallery Watermark', description: 'Apply custom watermark overlay to session gallery photos', group: 'media_ai' },
  { key: 'ai_recognition', label: 'AI Face Recognition (My Media)', description: 'People in Media face matching & guest selfie discovery', group: 'media_ai' },
  { key: 'event_highlights', label: 'Event Highlights', description: 'Manage highlight cards shown on the event screen', group: 'event' },
  { key: 'event_explore', label: 'Explore Nearby Mapping', description: 'Map venues and local explore categories/items to an event', group: 'event' },
  { key: 'event_qr', label: 'QR Code & Join Share Links', description: 'Generate event join QR codes and deep-link share modals', group: 'event' },
  { key: 'event_current_happening', label: 'Current Happening Updates', description: 'Phase-controlled live event happenings and photo carousels', group: 'event' },
  { key: 'event_post_report', label: 'Post-Event Report PDF', description: 'Upload and schedule post-event PDF reports', group: 'event' },
  { key: 'event_guests_export', label: 'Guest List CSV Export', description: 'Download registered guest list with contacts and sides', group: 'event' },
  { key: 'push_notifications', label: 'Push Notifications', description: 'Send targeted or event-wide mobile push & in-app alerts', group: 'mobile' },
  { key: 'mobile_favorites', label: 'Mobile Favorites Bookmarking', description: 'Allow guests to bookmark posts and session photos on mobile', group: 'mobile' },
  { key: 'mobile_feed', label: 'Mobile Social Feed & Posts', description: 'Allow guests to share posts, like, and comment on event feed', group: 'mobile' },
  { key: 'venues_manage', label: 'Private Venues Management', description: 'Create and edit client-private venues & halls', group: 'workspace' },
  { key: 'app_themes_manage', label: 'Custom App Themes', description: 'Create and apply custom mobile color themes', group: 'workspace' },
  { key: 'explore_categories_manage', label: 'Custom Explore Categories & Items', description: 'Create private explore categories and local listings', group: 'workspace' },
  { key: 'sub_users_manage', label: 'Team Users & Sub-Roles', description: 'Create photographers, coordinators, and sub-users under client', group: 'workspace' },
];

export const PERMISSION_KEYS = [
  'events.view',
  'events.create',
  'events.edit',
  'events.delete',
  'sessions.view',
  'sessions.manage',
  'media.view',
  'media.upload',
  'media.delete',
  'team.view',
  'team.manage',
  'watermark.manage',
  'highlights.manage',
  'explore.manage',
  'happening.manage',
  'report.manage',
  'people_media.view',
  'qr.view',
  'guests.export',
  'notifications.send',
  'venues.view',
  'venues.manage',
  'explore_categories.view',
  'explore_categories.manage',
  'app_themes.view',
  'app_themes.manage',
  'users.view',
  'users.manage',
  'plans.manage',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const PERMISSION_CATALOG: Array<{
  key: PermissionKey;
  label: string;
  group: 'events' | 'media' | 'engagement' | 'master' | 'admin';
}> = [
  { key: 'events.view', label: 'View Events & Details', group: 'events' },
  { key: 'events.create', label: 'Create New Events', group: 'events' },
  { key: 'events.edit', label: 'Edit Event Settings & Status', group: 'events' },
  { key: 'events.delete', label: 'Delete Events', group: 'events' },
  { key: 'sessions.view', label: 'View Days & Sessions', group: 'events' },
  { key: 'sessions.manage', label: 'Create/Edit Days & Sessions', group: 'events' },
  { key: 'team.view', label: 'View Planner & Photographer Info', group: 'events' },
  { key: 'team.manage', label: 'Edit Planner & Photographer Info', group: 'events' },
  { key: 'media.view', label: 'View Session Media Gallery', group: 'media' },
  { key: 'media.upload', label: 'Upload Photos, Videos & Folders', group: 'media' },
  { key: 'media.delete', label: 'Delete Session Media & Manage Uploaders', group: 'media' },
  { key: 'watermark.manage', label: 'Configure Gallery Watermark', group: 'media' },
  { key: 'people_media.view', label: 'View & Retry AI Face Recognition', group: 'media' },
  { key: 'highlights.manage', label: 'Manage Event Highlights', group: 'engagement' },
  { key: 'explore.manage', label: 'Map Event Explore Items', group: 'engagement' },
  { key: 'happening.manage', label: 'Manage Current Happening', group: 'engagement' },
  { key: 'report.manage', label: 'Manage Post-Event Report PDF', group: 'engagement' },
  { key: 'qr.view', label: 'View & Share Event QR Links', group: 'engagement' },
  { key: 'guests.export', label: 'Export Event Guest List CSV', group: 'engagement' },
  { key: 'notifications.send', label: 'Send Push Notifications', group: 'engagement' },
  { key: 'venues.view', label: 'View Venues', group: 'master' },
  { key: 'venues.manage', label: 'Create/Edit Venues', group: 'master' },
  { key: 'explore_categories.view', label: 'View Explore Categories', group: 'master' },
  { key: 'explore_categories.manage', label: 'Create/Edit Explore Categories', group: 'master' },
  { key: 'app_themes.view', label: 'View App Themes', group: 'master' },
  { key: 'app_themes.manage', label: 'Create/Edit App Themes', group: 'master' },
  { key: 'users.view', label: 'View Users / Team Members', group: 'admin' },
  { key: 'users.manage', label: 'Create & Manage Users / Permissions', group: 'admin' },
  { key: 'plans.manage', label: 'Manage Purchase Plans & App Config', group: 'admin' },
];

/** Which purchased feature unlocks each permission when running inside a tenant plan. */
export const PERMISSION_REQUIRED_FEATURE: Partial<Record<PermissionKey, FeatureKey>> = {
  'events.create': 'event_basic',
  'events.edit': 'event_basic',
  'events.delete': 'event_basic',
  'sessions.manage': 'event_sessions',
  'team.manage': 'event_team',
  'media.upload': 'session_media_upload',
  'media.delete': 'session_media_upload',
  'watermark.manage': 'event_watermark',
  'people_media.view': 'ai_recognition',
  'highlights.manage': 'event_highlights',
  'explore.manage': 'event_explore',
  'happening.manage': 'event_current_happening',
  'report.manage': 'event_post_report',
  'qr.view': 'event_qr',
  'guests.export': 'event_guests_export',
  'notifications.send': 'push_notifications',
  'venues.manage': 'venues_manage',
  'explore_categories.manage': 'explore_categories_manage',
  'app_themes.manage': 'app_themes_manage',
  'users.view': 'sub_users_manage',
  'users.manage': 'sub_users_manage',
};

export function createFeatureMap(defaultValue: boolean): FeatureMap {
  const out = {} as FeatureMap;
  for (const key of FEATURE_KEYS) {
    out[key] = defaultValue;
  }
  return out;
}

export const ALL_FEATURES_ENABLED: FeatureMap = createFeatureMap(true);

export const STARTER_MEDIA_FEATURES: FeatureMap = {
  ...createFeatureMap(false),
  event_basic: true,
  event_sessions: true,
  event_team: true,
  session_media_upload: true,
  event_qr: true,
  sub_users_manage: true,
  venues_manage: true,
};

export type AdminRoleName =
  | 'super_admin'
  | 'support_staff'
  | 'client_admin'
  | 'event_admin'
  | 'photographer'
  | 'coordinator'
  | (string & {});

export type AdminModule =
  | 'dashboard'
  | 'events'
  | 'notifications'
  | 'venues'
  | 'explore-categories'
  | 'admins'
  | 'plans'
  | 'app-config'
  | 'app-themes';

export const MODULE_LABELS: Record<AdminModule, string> = {
  dashboard: 'Dashboard',
  admins: 'Users & Access',
  plans: 'Purchase Plans',
  venues: 'Venues',
  events: 'Events',
  notifications: 'Push Notifications',
  'explore-categories': 'Explore Categories',
  'app-config': 'App Configuration',
  'app-themes': 'App Themes',
};

export const MODULE_HREFS: Record<AdminModule, string> = {
  dashboard: '/dashboard',
  admins: '/dashboard/admins',
  plans: '/dashboard/plans',
  venues: '/dashboard/venues',
  events: '/dashboard/events',
  notifications: '/dashboard/notifications',
  'explore-categories': '/dashboard/explore-categories',
  'app-config': '/dashboard/app-config',
  'app-themes': '/dashboard/app-themes',
};

export const ROLE_DEFAULT_PERMISSIONS: Record<string, PermissionKey[]> = {
  super_admin: [...PERMISSION_KEYS],
  support_staff: PERMISSION_KEYS.filter((p) => p !== 'plans.manage'),
  client_admin: PERMISSION_KEYS.filter((p) => p !== 'plans.manage'),
  event_admin: [
    'events.view',
    'events.edit',
    'sessions.view',
    'sessions.manage',
    'media.view',
    'media.upload',
    'media.delete',
    'team.view',
    'team.manage',
    'watermark.manage',
    'highlights.manage',
    'explore.manage',
    'happening.manage',
    'report.manage',
    'people_media.view',
    'qr.view',
    'notifications.send',
    'venues.view',
    'explore_categories.view',
  ],
  photographer: ['events.view', 'sessions.view', 'media.view', 'media.upload'],
  coordinator: [
    'events.view',
    'sessions.view',
    'sessions.manage',
    'media.view',
    'media.upload',
    'team.view',
    'team.manage',
    'happening.manage',
    'qr.view',
    'notifications.send',
    'venues.view',
  ],
  user: [],
};

export function isAdminRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return role.trim().toLowerCase() !== 'user';
}

export function formatRoleDisplayName(roleName: string): string {
  switch (roleName) {
    case 'super_admin':
      return 'Super Admin';
    case 'support_staff':
      return 'Support Staff';
    case 'client_admin':
      return 'Client Admin (Event Planner)';
    case 'event_admin':
      return 'Event Admin';
    case 'photographer':
      return 'Photographer';
    case 'coordinator':
      return 'Event Coordinator';
    case 'user':
      return 'Guest User';
    default:
      return roleName
        .split('_')
        .filter(Boolean)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' ');
  }
}

export function computeEffectiveFeatures(
  planFeatures: unknown,
  featureOverrides: unknown
): FeatureMap {
  const base = createFeatureMap(true);
  if (planFeatures && typeof planFeatures === 'object' && !Array.isArray(planFeatures)) {
    const rec = planFeatures as Record<string, unknown>;
    for (const key of FEATURE_KEYS) {
      if (typeof rec[key] === 'boolean') {
        base[key] = rec[key] as boolean;
      }
    }
  }
  if (featureOverrides && typeof featureOverrides === 'object' && !Array.isArray(featureOverrides)) {
    const rec = featureOverrides as Record<string, unknown>;
    for (const key of FEATURE_KEYS) {
      if (typeof rec[key] === 'boolean') {
        base[key] = rec[key] as boolean;
      }
    }
  }
  return base;
}

export function computeEffectivePermissions(input: {
  roleName: string;
  rolePermissions?: unknown;
  customPermissions?: unknown;
  features: FeatureMap;
  applyFeatureGate: boolean;
}): Set<PermissionKey> {
  const { roleName, rolePermissions, customPermissions, features, applyFeatureGate } = input;
  if (roleName === 'super_admin') {
    return new Set(PERMISSION_KEYS);
  }

  let candidate: unknown = customPermissions;
  const hasCustom =
    Array.isArray(customPermissions) && customPermissions.length > 0;
  if (!hasCustom) {
    const hasRolePerms =
      Array.isArray(rolePermissions) && rolePermissions.length > 0;
    candidate = hasRolePerms
      ? rolePermissions
      : (ROLE_DEFAULT_PERMISSIONS[roleName] ?? []);
  }

  const valid = new Set<PermissionKey>();
  if (Array.isArray(candidate)) {
    for (const item of candidate) {
      if (typeof item !== 'string') continue;
      if (!(PERMISSION_KEYS as readonly string[]).includes(item)) continue;
      const perm = item as PermissionKey;
      if (applyFeatureGate) {
        const requiredFeature = PERMISSION_REQUIRED_FEATURE[perm];
        if (requiredFeature && !features[requiredFeature]) {
          continue;
        }
      }
      valid.add(perm);
    }
  }
  return valid;
}

export function modulesFromAccess(input: {
  tier: AdminTier;
  permissions: Set<PermissionKey>;
  features: FeatureMap;
}): AdminModule[] {
  const { tier, permissions, features } = input;
  const modules: AdminModule[] = ['dashboard'];

  if (tier === 'super_admin') {
    return ['dashboard', 'admins', 'plans', 'venues', 'events', 'notifications', 'explore-categories', 'app-config', 'app-themes'];
  }

  if (permissions.has('events.view')) modules.push('events');
  if (permissions.has('notifications.send') && features.push_notifications) modules.push('notifications');
  if (permissions.has('venues.view') || permissions.has('venues.manage')) modules.push('venues');
  if (permissions.has('explore_categories.view') || permissions.has('explore_categories.manage')) {
    if (tier !== 'client_subuser' || permissions.has('explore_categories.manage')) {
      modules.push('explore-categories');
    }
  }
  if (permissions.has('app_themes.view') || (permissions.has('app_themes.manage') && features.app_themes_manage)) {
    if (tier === 'super_staff' || features.app_themes_manage) {
      modules.push('app-themes');
    }
  }
  if (permissions.has('users.view') || permissions.has('users.manage')) {
    if (tier !== 'client_subuser') {
      modules.push('admins');
    } else if (permissions.has('users.manage')) {
      modules.push('admins');
    }
  }
  if (permissions.has('plans.manage')) {
    modules.push('plans', 'app-config');
  }

  return modules;
}

/**
 * Legacy helper kept for coarse client navigation fallback when full context is still loading.
 */
export function canAccessModule(role: string | null | undefined, module: AdminModule): boolean {
  if (!isAdminRole(role)) return false;
  if (role === 'super_admin') return true;
  if (module === 'plans' || module === 'app-config') return false;
  if (role === 'photographer') return module === 'dashboard' || module === 'events';
  if (role === 'event_admin' || role === 'coordinator') {
    return module !== 'admins';
  }
  return true;
}

export function moduleFromPathname(pathname: string): AdminModule | null {
  if (!pathname || !pathname.startsWith('/dashboard')) return null;
  if (pathname === '/dashboard') return 'dashboard';
  if (pathname.startsWith('/dashboard/admins')) return 'admins';
  if (pathname.startsWith('/dashboard/plans')) return 'plans';
  if (pathname.startsWith('/dashboard/venues')) return 'venues';
  if (pathname.startsWith('/dashboard/events')) return 'events';
  if (pathname.startsWith('/dashboard/notifications')) return 'notifications';
  if (pathname.startsWith('/dashboard/explore-categories')) return 'explore-categories';
  if (pathname.startsWith('/dashboard/app-config')) return 'app-config';
  if (pathname.startsWith('/dashboard/app-themes')) return 'app-themes';
  return null;
}
