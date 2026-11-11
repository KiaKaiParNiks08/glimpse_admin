'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './admins.module.scss';
import { UserFormModal } from './UserFormModal';
import { RolePermissionsModal } from './RolePermissionsModal';
import { PaginatedTable } from '@/components/PaginatedTable';
import { formatRoleDisplayName } from '@/lib/rbac';
import { useAdminAccess } from '@/components/auth/AdminAccessContext';
import {
  getUsersAction,
  getRolesAction,
  updateUserAction,
  type RoleItem,
  type UserListItem,
} from '@/app/actions/admins';
import { ContentSkeleton } from '@/components/navigation/ContentSkeleton';

type FormMode = 'create' | 'edit';

const PAGE_LIMIT = 8;

export default function DashboardUsersPage() {
  const router = useRouter();
  const { access, hasPermission } = useAdminAccess();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [selectedUser, setSelectedUser] = useState<UserListItem | null>(null);
  const [rolesModalOpen, setRolesModalOpen] = useState(false);

  const [statusLoadingId, setStatusLoadingId] = useState<string | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);

  const debouncedSearch = useDebouncedValue(search, 300);

  const canViewUsers = hasPermission('users.view') || hasPermission('users.manage');
  const canManageUsers = hasPermission('users.manage');
  const isSuperAdmin = access?.tier === 'super_admin';

  useEffect(() => {
    if (!access) return;
    if (!canViewUsers) {
      router.replace('/dashboard');
    }
  }, [access, canViewUsers, router]);

  useEffect(() => {
    if (!access || !canViewUsers) return;
    let cancelled = false;

    async function fetchUsers() {
      setLoading(true);
      setError(null);
      try {
        const result = await getUsersAction({
          page,
          limit: PAGE_LIMIT,
          ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }),
        });
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error ?? 'Unable to load users');
          return;
        }
        setUsers(result.data);
        setTotalPages(result.meta.totalPages || 1);
        setTotal(result.meta.total ?? 0);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Unable to load users');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchUsers();
    return () => {
      cancelled = true;
    };
  }, [access, canViewUsers, page, debouncedSearch, listRefreshKey]);

  async function refreshRoles() {
    const result = await getRolesAction();
    if (result.ok && result.data) setRoles(result.data);
  }

  useEffect(() => {
    if (!access || !canViewUsers) return;
    let cancelled = false;
    getRolesAction().then((result) => {
      if (!cancelled && result.ok && result.data) setRoles(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [access, canViewUsers]);

  if (!access || !canViewUsers) {
    return <ContentSkeleton />;
  }

  function openCreateForm() {
    setFormMode('create');
    setSelectedUser(null);
    setFormOpen(true);
  }

  function openEditForm(user: UserListItem) {
    setFormMode('edit');
    setSelectedUser(user);
    setFormOpen(true);
  }

  function handleFormSuccess() {
    setPage(1);
    setListRefreshKey((k) => k + 1);
  }

  async function handleToggleStatus(user: UserListItem) {
    const nextActive = !(user.is_active ?? true);
    setStatusLoadingId(user.id);
    try {
      const result = await updateUserAction(user.id, { is_active: nextActive });
      if (!result.ok) {
        alert(result.error ?? 'Failed to update status');
        return;
      }
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, is_active: nextActive } : u))
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Unable to update user status');
    } finally {
      setStatusLoadingId(null);
    }
  }

  function renderScopeCell(u: UserListItem) {
    if (u.role_name === 'super_admin') {
      return <span className={styles.metaPill}>Platform Root</span>;
    }
    if (u.role_name === 'support_staff') {
      return (
        <span className={styles.metaPill}>
          {u.assigned_client_ids.length} client(s) assigned
        </span>
      );
    }
    if (u.role_name === 'client_admin') {
      return (
        <span className={styles.metaPill}>
          Plan: {u.purchase_plan_name ?? 'Default / Full'}
        </span>
      );
    }
    return (
      <span className={styles.metaPill}>
        {u.tenant_owner_name ? `${u.tenant_owner_name} · ` : ''}
        {u.assigned_event_ids.length} event(s)
      </span>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.headerText}>
          <h1>Users, Roles &amp; Access</h1>
          <p>
            {isSuperAdmin
              ? 'Manage Support Staff, Client Admins with Purchase Plans, Custom Roles, and Event Sub-Users.'
              : access.tier === 'client_admin'
              ? `Manage your event photographers, coordinators, and team sub-users${access.purchase_plan_name ? ` (Plan: ${access.purchase_plan_name})` : ''}.`
              : 'Manage assigned client administrators and event team users.'}
          </p>
        </div>
        <div className={styles.headerActions}>
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setRolesModalOpen(true)}
              className={styles.btnSecondary}
            >
              Manage Roles &amp; Permissions
            </button>
          )}
          {canManageUsers && (
            <button
              type="button"
              onClick={openCreateForm}
              className={styles.newUserButton}
            >
              + New user
            </button>
          )}
        </div>
      </div>

      <div className={styles.controlsRow}>
        <input
          type="search"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          className={styles.searchInput}
        />
      </div>

      {error && <p className={styles.errorText}>{error}</p>}

      <PaginatedTable
        header={
          <tr className={styles.tableHeadRow}>
            <th className={styles.th}>Name</th>
            <th className={styles.th}>Email</th>
            <th className={styles.th}>Role</th>
            <th className={styles.th}>Plan / Scope</th>
            <th className={styles.th}>Status</th>
            <th className={styles.th}>Phone</th>
            {canManageUsers && <th className={styles.thActions}>Actions</th>}
          </tr>
        }
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={PAGE_LIMIT}
        colSpan={canManageUsers ? 7 : 6}
        loading={loading}
        loadingMessage="Loading users…"
        emptyMessage="No users found."
        onPageChange={setPage}
      >
        {users.map((user) => (
          <tr key={user.id} className={styles.rowDivider}>
            <td className={styles.td}>
              <div className={styles.userName}>
                <span>{user.full_name}</span>
              </div>
            </td>
            <td className={styles.td}>{user.email}</td>
            <td className={styles.td}>
              <span className={styles.rolePill}>{formatRoleDisplayName(user.role_name)}</span>
            </td>
            <td className={styles.td}>{renderScopeCell(user)}</td>
            <td className={styles.td}>
              <span
                className={`${styles.statusPill} ${
                  user.is_active ? styles['statusPill--active'] : styles['statusPill--inactive']
                }`}
              >
                <span
                  className={`${styles.statusDot} ${
                    user.is_active ? styles['statusDot--active'] : styles['statusDot--inactive']
                  }`}
                />
                {user.is_active ? 'Active' : 'Inactive'}
              </span>
            </td>
            <td className={styles.td}>
              {user.mobile_number ? (
                <span className={styles.phoneText}>
                  {user.country_code ? `+${user.country_code} ` : ''}
                  {user.mobile_number}
                </span>
              ) : (
                <span className={styles.phoneEmpty}>—</span>
              )}
            </td>
            {canManageUsers && (
              <td className={styles.td} style={{ textAlign: 'right' }}>
                <div className={styles.actions}>
                  {user.role_name !== 'super_admin' && (
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(user)}
                      disabled={statusLoadingId === user.id}
                      className={`${styles.btnStatus} ${
                        user.is_active ? styles['btnStatus--active'] : styles['btnStatus--inactive']
                      }`}
                    >
                      {statusLoadingId === user.id
                        ? 'Updating…'
                        : user.is_active
                        ? 'Deactivate'
                        : 'Activate'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openEditForm(user)}
                    className={styles.btnEdit}
                  >
                    Edit
                  </button>
                </div>
              </td>
            )}
          </tr>
        ))}
      </PaginatedTable>

      <UserFormModal
        open={formOpen}
        mode={formMode}
        user={selectedUser}
        roles={roles}
        callerAccess={access}
        formatRoleName={formatRoleDisplayName}
        onClose={() => setFormOpen(false)}
        onSuccess={handleFormSuccess}
      />

      {isSuperAdmin && (
        <RolePermissionsModal
          open={rolesModalOpen}
          roles={roles}
          onClose={() => setRolesModalOpen(false)}
          onSuccess={() => void refreshRoles()}
        />
      )}
    </div>
  );
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
