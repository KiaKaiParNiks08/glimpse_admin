'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './admins.module.scss';
import { UserFormModal, type UserFormUser, type UserFormRole } from './UserFormModal';
import { PaginatedTable } from '@/components/PaginatedTable';
import { adminBearerAuthHeader } from '@/lib/admin-jwt-client';
import { signOutToLogin } from '@/lib/admin-sign-out';
import {
  getUsersAction,
  getRolesAction,
  updateUserAction,
} from '@/app/actions/admins';
import { canAccessModule } from '@/lib/rbac';

export type UserListItem = {
  id: string;
  full_name: string;
  email: string;
  role_id: number;
  is_active: boolean | null;
  avatar_url: string | null;
  mobile_number: string | null;
  country_code: string | null;
};

type Role = {
  id: number;
  name: string;
};

function formatRoleName(name: string): string {
  switch (name) {
    case 'super_admin':
      return 'Super Admin';
    case 'event_admin':
      return 'Event Admin';
    case 'user':
      return 'User';
    default: {
      if (!name) return '';
      return name
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
    }
  }
}

type FormMode = 'create' | 'edit';

const PAGE_LIMIT = 6;

export default function DashboardUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [accessChecked, setAccessChecked] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [selectedUser, setSelectedUser] = useState<UserListItem | null>(null);

  const [statusLoadingId, setStatusLoadingId] = useState<string | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);

  const debouncedSearch = useDebouncedValue(search, 300);

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
        type AdminUser = { role_name: string };
        type AdminMeJson = {
          data?: { user?: AdminUser } | null;
          user?: AdminUser;
        };
        const json = (await r.json()) as AdminMeJson;
        const roleName = json.data?.user?.role_name ?? json.user?.role_name;
        if (!canAccessModule(roleName, 'admins')) {
          router.replace('/dashboard');
          return;
        }
        setAccessChecked(true);
      })
      .catch(() => void signOutToLogin(router));
  }, [router]);

  useEffect(() => {
    if (!accessChecked) return;
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
  }, [page, debouncedSearch, listRefreshKey, accessChecked]);

  useEffect(() => {
    if (!accessChecked) return;
    let cancelled = false;

    async function fetchRoles() {
      try {
        const result = await getRolesAction();
        if (cancelled) return;
        if (result.ok && result.data) setRoles(result.data);
      } catch {
        // ignore – roles list will just be empty and fall back to id
      }
    }

    fetchRoles();

    return () => {
      cancelled = true;
    };
  }, [accessChecked]);

  if (!accessChecked) {
    return <p style={{ color: '#94a3b8' }}>Loading…</p>;
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
      const msg = e instanceof Error ? e.message : 'Unable to update user status';
      alert(msg);
    } finally {
      setStatusLoadingId(null);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.headerText}>
          <h1>Admins</h1>
          <p>Manage admin users. You can create, edit, and delete admins.</p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className={styles.newUserButton}
        >
          + New admin
        </button>
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

      {error && (
        <p className={styles.errorText}>{error}</p>
      )}

      <PaginatedTable
        header={(
          <tr className={styles.tableHeadRow}>
            <th className={styles.th}>Name</th>
            <th className={styles.th}>Email</th>
            <th className={styles.th}>Role</th>
            <th className={styles.th}>Status</th>
            <th className={styles.th}>Phone</th>
            <th className={styles.thActions}>Actions</th>
          </tr>
        )}
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={PAGE_LIMIT}
        colSpan={6}
        loading={loading}
        loadingMessage="Loading admins…"
        emptyMessage="No admins found."
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
              <span className={styles.rolePill}>
                {formatRoleName(roles.find((r) => r.id === user.role_id)?.name ?? `Role #${user.role_id}`)}
              </span>
            </td>
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
            <td className={styles.td} style={{ textAlign: 'right' }}>
              <div className={styles.actions}>
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
                <button
                  type="button"
                  onClick={() => openEditForm(user)}
                  className={styles.btnEdit}
                >
                  Edit
                </button>
              </div>
            </td>
          </tr>
        ))}
      </PaginatedTable>

      <UserFormModal
        open={formOpen}
        mode={formMode}
        user={selectedUser as UserFormUser | null}
        roles={(roles as UserFormRole[]).filter((r) => r.name !== 'user')}
        formatRoleName={formatRoleName}
        onClose={() => setFormOpen(false)}
        onSuccess={handleFormSuccess}
      />
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
