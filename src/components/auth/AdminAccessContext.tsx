'use client';

import { createContext, useContext } from 'react';
import type { ClientAdminAccess } from '@/server/access';
import type { FeatureKey, PermissionKey } from '@/lib/rbac';

type AdminAccessContextValue = {
  access: ClientAdminAccess | null;
  hasPermission: (perm: PermissionKey) => boolean;
  hasFeature: (feature: FeatureKey) => boolean;
};

const AdminAccessContext = createContext<AdminAccessContextValue>({
  access: null,
  hasPermission: () => false,
  hasFeature: () => false,
});

export function AdminAccessProvider({
  access,
  children,
}: {
  access: ClientAdminAccess | null;
  children: React.ReactNode;
}) {
  const value: AdminAccessContextValue = {
    access,
    hasPermission: (perm: PermissionKey) => {
      if (!access) return false;
      if (access.tier === 'super_admin') return true;
      return access.permissions.includes(perm);
    },
    hasFeature: (feature: FeatureKey) => {
      if (!access) return false;
      if (access.tier === 'super_admin') return true;
      return access.features[feature] === true;
    },
  };

  return <AdminAccessContext.Provider value={value}>{children}</AdminAccessContext.Provider>;
}

export function useAdminAccess() {
  return useContext(AdminAccessContext);
}
