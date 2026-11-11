'use client';

import { useEffect, useState } from 'react';
import {
  PERMISSION_CATALOG,
  formatRoleDisplayName,
  type PermissionKey,
} from '@/lib/rbac';
import {
  createCustomRoleAction,
  updateRolePermissionsAction,
  type RoleItem,
} from '@/app/actions/admins';
import styles from './admins.module.scss';

const GROUPS: Array<'events' | 'media' | 'engagement' | 'master' | 'admin'> = [
  'events',
  'media',
  'engagement',
  'master',
  'admin',
];

const GROUP_LABELS: Record<(typeof GROUPS)[number], string> = {
  events: 'Events, Sessions & Team',
  media: 'Media, Watermark & AI Recognition',
  engagement: 'Highlights, Explore, QR & Push',
  master: 'Master Data (Venues, Themes, Explore)',
  admin: 'Users & Purchase Plans',
};

export function RolePermissionsModal({
  open,
  roles,
  onClose,
  onSuccess,
}: {
  open: boolean;
  roles: RoleItem[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const editableRoles = roles.filter((r) => r.name !== 'user' && r.name !== 'super_admin');
  const [selectedRoleId, setSelectedRoleId] = useState<number | 'new'>('new');
  const [newName, setNewName] = useState('');
  const [newScope, setNewScope] = useState<'platform' | 'tenant'>('tenant');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<Set<PermissionKey>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editableRoles.length > 0) {
      const first = editableRoles[0]!;
      setSelectedRoleId(first.id);
      setDescription(first.description ?? '');
      setPermissions(new Set(first.permissions));
    } else {
      setSelectedRoleId('new');
      setNewName('');
      setNewScope('tenant');
      setDescription('');
      setPermissions(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleSelectRole(val: string) {
    setError(null);
    if (val === 'new') {
      setSelectedRoleId('new');
      setNewName('');
      setNewScope('tenant');
      setDescription('');
      setPermissions(new Set(['events.view', 'sessions.view', 'media.view']));
      return;
    }
    const id = Number(val);
    const found = editableRoles.find((r) => r.id === id);
    if (!found) return;
    setSelectedRoleId(found.id);
    setDescription(found.description ?? '');
    setPermissions(new Set(found.permissions));
  }

  function togglePerm(key: PermissionKey) {
    setPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const permArray = Array.from(permissions);
      if (selectedRoleId === 'new') {
        if (!newName.trim()) throw new Error('Role name is required');
        const res = await createCustomRoleAction({
          name: newName.trim(),
          description: description.trim() || null,
          scope: newScope,
          permissions: permArray,
        });
        if (!res.ok) throw new Error(res.error);
      } else {
        const res = await updateRolePermissionsAction(
          selectedRoleId,
          permArray,
          description.trim() || null
        );
        if (!res.ok) throw new Error(res.error);
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save role');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className={styles.overlay}>
      <div className={`${styles.modal} ${styles.modalWide}`}>
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>Roles &amp; Default Permissions</h2>
            <p className={styles.modalSubtitle}>
              Configure static roles or create custom sub-roles with exact default permissions.
            </p>
          </div>
          <button type="button" onClick={onClose} className={styles.modalClose} aria-label="Close">
            ×
          </button>
        </div>

        {error && <p className={styles.modalError}>{error}</p>}

        <form onSubmit={handleSave} className={styles.form}>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label}>Select Role or Create New</label>
              <select
                className={styles.select}
                value={String(selectedRoleId)}
                onChange={(e) => handleSelectRole(e.target.value)}
              >
                {editableRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {formatRoleDisplayName(r.name)} ({r.scope}
                    {r.is_system ? ' · system' : ' · custom'})
                  </option>
                ))}
                <option value="new">+ Create custom role</option>
              </select>
            </div>
            {selectedRoleId === 'new' && (
              <>
                <div className={styles.field}>
                  <label className={styles.label}>Role key/name *</label>
                  <input
                    className={styles.input}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. assistant_editor"
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Hierarchy Scope</label>
                  <select
                    className={styles.select}
                    value={newScope}
                    onChange={(e) => setNewScope(e.target.value as 'platform' | 'tenant')}
                  >
                    <option value="tenant">Client Tenant Role (under Client Admin)</option>
                    <option value="platform">Platform Staff Role (under Super Admin)</option>
                  </select>
                </div>
              </>
            )}
          </div>

          <div>
            <label className={styles.label}>Description</label>
            <input
              className={styles.input}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Role summary"
            />
          </div>

          <div className={styles.permBox}>
            {GROUPS.map((grp) => (
              <div key={grp} className={styles.permGroup}>
                <div className={styles.permGroupTitle}>{GROUP_LABELS[grp]}</div>
                <div className={styles.permGrid}>
                  {PERMISSION_CATALOG.filter((p) => p.group === grp).map((item) => (
                    <label key={item.key} className={styles.permOption}>
                      <input
                        type="checkbox"
                        checked={permissions.has(item.key)}
                        onChange={() => togglePerm(item.key)}
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className={styles.formActions}>
            <button type="button" onClick={onClose} className={styles.btnCancel}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={styles.btnSubmit}>
              {saving ? 'Saving…' : selectedRoleId === 'new' ? 'Create Role' : 'Save Role Permissions'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
