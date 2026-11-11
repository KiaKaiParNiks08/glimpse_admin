'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './admins.module.scss';
import {
  computeEffectiveFeatures,
  FEATURE_CATALOG,
  PERMISSION_CATALOG,
  PERMISSION_REQUIRED_FEATURE,
  type FeatureKey,
  type PermissionKey,
} from '@/lib/rbac';
import type { ClientAdminAccess } from '@/server/access';
import {
  createUserAction,
  getClientAdminsForSelectAction,
  getTenantEventsForSelectAction,
  updateUserAction,
  type RoleItem,
  type UserListItem,
} from '@/app/actions/admins';
import { listPurchasePlansAction, type PurchasePlanItem } from '@/app/actions/plans';

type ClientOption = {
  id: string;
  full_name: string;
  email: string;
  purchase_plan_name: string | null;
};

type EventOption = {
  id: string;
  title: string;
  event_code: string;
};

type UserFormModalProps = {
  open: boolean;
  mode: 'create' | 'edit';
  user: UserListItem | null;
  roles: RoleItem[];
  callerAccess: ClientAdminAccess;
  formatRoleName: (name: string) => string;
  onClose: () => void;
  onSuccess: () => void;
};

const PERM_GROUPS: Array<{ key: 'events' | 'media' | 'engagement' | 'master' | 'admin'; label: string }> = [
  { key: 'events', label: 'Events, Sessions & Team' },
  { key: 'media', label: 'Media, Watermark & AI' },
  { key: 'engagement', label: 'Highlights, Explore, QR & Push' },
  { key: 'master', label: 'Venues, Themes & Categories' },
  { key: 'admin', label: 'Users & Workspace' },
];

export function UserFormModal({
  open,
  mode,
  user,
  roles,
  callerAccess,
  formatRoleName,
  onClose,
  onSuccess,
}: UserFormModalProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Plan & overrides (for client_admin)
  const [plans, setPlans] = useState<PurchasePlanItem[]>([]);
  const [purchasePlanId, setPurchasePlanId] = useState('');
  const [featureOverrides, setFeatureOverrides] = useState<Partial<Record<FeatureKey, boolean>>>({});
  const [showOverrides, setShowOverrides] = useState(false);

  // Hierarchy assignments
  const [clientAdmins, setClientAdmins] = useState<ClientOption[]>([]);
  const [selectedTenantOwnerId, setSelectedTenantOwnerId] = useState('');
  const [assignedClientIds, setAssignedClientIds] = useState<string[]>([]);
  const [tenantEvents, setTenantEvents] = useState<EventOption[]>([]);
  const [assignedEventIds, setAssignedEventIds] = useState<string[]>([]);

  // Granular permission override
  const [useCustomPerms, setUseCustomPerms] = useState(false);
  const [customPerms, setCustomPerms] = useState<Set<PermissionKey>>(new Set());

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assignableRoles = useMemo(() => {
    const filtered = roles.filter((r) => {
      if (r.name === 'user' || r.name === 'super_admin') return false;
      if (callerAccess.tier === 'super_admin') return true;
      if (callerAccess.tier === 'super_staff') {
        return r.name === 'client_admin' || r.scope === 'tenant';
      }
      return r.scope === 'tenant' && r.name !== 'client_admin';
    });
    // Ensure edited user's current role stays visible in the dropdown
    if (mode === 'edit' && user) {
      const current = roles.find((r) => r.id === user.role_id);
      if (current && !filtered.some((r) => r.id === current.id)) {
        return [current, ...filtered];
      }
    }
    return filtered;
  }, [roles, callerAccess.tier, mode, user]);

  const selectedRole = useMemo(
    () => roles.find((r) => String(r.id) === roleId) ?? null,
    [roles, roleId]
  );

  const isSupportStaffRole = selectedRole?.name === 'support_staff';
  const isClientAdminRole = selectedRole?.name === 'client_admin';
  const isTenantSubUserRole = Boolean(
    selectedRole && selectedRole.scope === 'tenant' && selectedRole.name !== 'client_admin'
  );

  // Determine active feature set gating permissions preview for this user
  const targetClientFeatures = useMemo(() => {
    if (isClientAdminRole) {
      const plan = plans.find((p) => p.id === purchasePlanId);
      return computeEffectiveFeatures(plan?.features, featureOverrides);
    }
    if (isTenantSubUserRole) {
      if (callerAccess.tier === 'client_admin' || callerAccess.tier === 'client_subuser') {
        return callerAccess.features;
      }
      // If editing subuser, fall back to all features when Super Admin selects plan on client
      const clientOpt = clientAdmins.find((c) => c.id === selectedTenantOwnerId);
      const clientPlan = plans.find((p) => p.name === clientOpt?.purchase_plan_name);
      return clientPlan ? clientPlan.features : callerAccess.features;
    }
    return callerAccess.features;
  }, [
    isClientAdminRole,
    isTenantSubUserRole,
    plans,
    purchasePlanId,
    featureOverrides,
    callerAccess,
    clientAdmins,
    selectedTenantOwnerId,
  ]);

  useEffect(() => {
    if (!open) return;
    setSubmitting(false);
    setError(null);
    setShowOverrides(false);

    if (mode === 'create') {
      setFullName('');
      setEmail('');
      setPassword('');
      setRoleId('');
      setCountryCode('');
      setMobileNumber('');
      setIsActive(true);
      setPurchasePlanId('');
      setFeatureOverrides({});
      setAssignedClientIds([]);
      setAssignedEventIds([]);
      setSelectedTenantOwnerId(
        callerAccess.tier === 'client_admin' || callerAccess.tier === 'client_subuser'
          ? callerAccess.tenant_owner_id ?? callerAccess.id
          : ''
      );
      setUseCustomPerms(false);
      setCustomPerms(new Set());
    } else if (user) {
      setFullName(user.full_name);
      setEmail(user.email);
      setPassword('');
      setRoleId(String(user.role_id));
      setCountryCode(user.country_code ?? '');
      setMobileNumber(user.mobile_number ?? '');
      setIsActive(user.is_active ?? true);
      setPurchasePlanId(user.purchase_plan_id ?? '');
      setFeatureOverrides(user.feature_overrides ?? {});
      setShowOverrides(Boolean(user.feature_overrides && Object.keys(user.feature_overrides).length > 0));
      setAssignedClientIds(user.assigned_client_ids ?? []);
      setAssignedEventIds(user.assigned_event_ids ?? []);
      setSelectedTenantOwnerId(user.tenant_owner_id ?? '');

      if (user.custom_permissions && user.custom_permissions.length > 0) {
        setUseCustomPerms(true);
        setCustomPerms(new Set(user.custom_permissions));
      } else {
        setUseCustomPerms(false);
        const userRole = roles.find((r) => r.id === user.role_id);
        setCustomPerms(new Set(userRole?.permissions ?? []));
      }
    }

    if (callerAccess.tier === 'super_admin' || callerAccess.tier === 'super_staff') {
      listPurchasePlansAction({ includeInactive: false }).then((res) => {
        if (res.ok) {
          setPlans(res.data);
          if (mode === 'create') {
            const def = res.data.find((p) => p.is_default) ?? res.data[0];
            if (def) setPurchasePlanId(def.id);
          }
        }
      });
      getClientAdminsForSelectAction().then((res) => {
        if (res.ok) {
          setClientAdmins(res.data);
        }
      });
    }
  }, [open, mode, user, callerAccess, roles]);

  // Seed custom permission preview when selecting a role in create mode
  function handleRoleChange(nextRoleId: string) {
    setRoleId(nextRoleId);
    const r = roles.find((item) => String(item.id) === nextRoleId);
    if (r && !useCustomPerms) {
      setCustomPerms(new Set(r.permissions));
    }
  }

  // Load tenant events when configuring a sub-user
  useEffect(() => {
    if (!open || !isTenantSubUserRole) return;
    const ownerScope =
      callerAccess.tier === 'client_admin' || callerAccess.tier === 'client_subuser'
        ? callerAccess.tenant_owner_id ?? callerAccess.id
        : selectedTenantOwnerId || undefined;

    if (
      (callerAccess.tier === 'super_admin' || callerAccess.tier === 'super_staff') &&
      !ownerScope
    ) {
      setTenantEvents([]);
      return;
    }

    getTenantEventsForSelectAction(ownerScope).then((res) => {
      if (res.ok) setTenantEvents(res.data);
    });
  }, [open, isTenantSubUserRole, selectedTenantOwnerId, callerAccess]);

  function togglePerm(key: PermissionKey) {
    setCustomPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleId(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  function setOverrideValue(key: FeatureKey, modeVal: 'default' | 'true' | 'false') {
    setFeatureOverrides((prev) => {
      const next = { ...prev };
      if (modeVal === 'default') delete next[key];
      else next[key] = modeVal === 'true';
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    if (!fullName.trim()) {
      setError('Full name is required');
      return;
    }
    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    if (!roleId) {
      setError('Role is required');
      return;
    }
    if (
      mode === 'create' &&
      isTenantSubUserRole &&
      (callerAccess.tier === 'super_admin' || callerAccess.tier === 'super_staff') &&
      !selectedTenantOwnerId
    ) {
      setError('Select the parent Client Admin workspace for this sub-user');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const customPermPayload = useCustomPerms ? Array.from(customPerms) : null;
      const overridesPayload =
        callerAccess.tier === 'super_admin' && isClientAdminRole
          ? Object.keys(featureOverrides).length > 0
            ? featureOverrides
            : null
          : undefined;

      if (mode === 'create') {
        if (!password || password.length < 6) {
          throw new Error('Password must be at least 6 characters');
        }
        const res = await createUserAction({
          full_name: fullName.trim(),
          email: email.trim(),
          password,
          role_id: Number(roleId),
          ...(countryCode.trim() && { country_code: countryCode.trim() }),
          ...(mobileNumber.trim() && { mobile_number: mobileNumber.trim() }),
          is_active: isActive,
          ...(isClientAdminRole && {
            purchase_plan_id: purchasePlanId || null,
            feature_overrides: overridesPayload ?? null,
          }),
          ...(isSupportStaffRole && {
            assigned_client_ids: assignedClientIds,
          }),
          ...(isTenantSubUserRole && {
            tenant_owner_id: selectedTenantOwnerId || callerAccess.tenant_owner_id || callerAccess.id,
            assigned_event_ids: assignedEventIds,
          }),
          custom_permissions: customPermPayload,
        });
        if (!res.ok) throw new Error(res.error);
      } else if (mode === 'edit' && user) {
        const res = await updateUserAction(user.id, {
          full_name: fullName.trim(),
          is_active: isActive,
          country_code: countryCode.trim() || null,
          mobile_number: mobileNumber.trim() || null,
          ...(password ? { password } : {}),
          ...(isClientAdminRole && callerAccess.tier === 'super_admin'
            ? {
                purchase_plan_id: purchasePlanId || null,
                feature_overrides: overridesPayload ?? null,
              }
            : {}),
          ...(isSupportStaffRole && callerAccess.tier === 'super_admin'
            ? { assigned_client_ids: assignedClientIds }
            : {}),
          ...(isTenantSubUserRole ? { assigned_event_ids: assignedEventIds } : {}),
          custom_permissions: customPermPayload,
        });
        if (!res.ok) throw new Error(res.error);
      }

      onSuccess();
      onClose();
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : 'Unable to submit form');
    }
  }

  if (!open) return null;

  const selectedPlan = plans.find((p) => p.id === purchasePlanId);

  return (
    <div className={styles.overlay}>
      <div className={`${styles.modal} ${styles.modalWide}`}>
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>
              {mode === 'create' ? 'Create User & Access' : 'Edit User & Access'}
            </h2>
            <p className={styles.modalSubtitle}>
              {callerAccess.tier === 'client_admin' || callerAccess.tier === 'client_subuser'
                ? 'Add photographers, coordinators, or team members scoped to selected events.'
                : 'Configure account hierarchy, purchased plan, overrides, and permissions.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={styles.modalClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {error && <p className={styles.modalError}>{error}</p>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label}>
                Full name<span className={styles.required}> *</span>
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={styles.input}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>
                Email<span className={styles.required}> *</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={mode === 'edit'}
                className={styles.input}
              />
            </div>
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label}>
                {mode === 'create' ? 'Password' : 'New password (optional)'}
                {mode === 'create' && <span className={styles.required}> *</span>}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'edit' ? 'Leave blank to keep current password' : ''}
                className={styles.input}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>
                Role<span className={styles.required}> *</span>
              </label>
              <select
                value={roleId}
                onChange={(e) => handleRoleChange(e.target.value)}
                disabled={mode === 'edit'}
                className={styles.select}
              >
                <option value="">Select role</option>
                {assignableRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {formatRoleName(role.name)}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.checkboxRow}>
              <input
                id="user-form-is_active"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <label htmlFor="user-form-is_active">Active</label>
            </div>
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label}>Country code</label>
              <input
                type="text"
                placeholder="91"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className={styles.input}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Mobile number</label>
              <input
                type="text"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                className={styles.input}
              />
            </div>
          </div>

          {/* Client Admin: Purchase Plan & Per-Client Overrides */}
          {isClientAdminRole && (
            <div className={styles.sectionBox}>
              <div className={styles.sectionTitle}>
                <span>Purchase Plan &amp; Client Features</span>
                {callerAccess.tier === 'super_admin' && (
                  <button
                    type="button"
                    className={styles.overrideSelect}
                    onClick={() => setShowOverrides((v) => !v)}
                  >
                    {showOverrides ? 'Hide Feature Overrides' : 'Customize Per-Client Overrides'}
                  </button>
                )}
              </div>

              <div>
                <label className={styles.label}>Assigned Purchase Plan</label>
                <select
                  className={styles.select}
                  value={purchasePlanId}
                  disabled={mode === 'edit' && callerAccess.tier !== 'super_admin'}
                  onChange={(e) => setPurchasePlanId(e.target.value)}
                >
                  <option value="">No plan (use default / all enabled)</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.max_events != null ? ` · max ${p.max_events} events` : ''}
                      {p.max_sub_users != null ? ` · max ${p.max_sub_users} users` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {callerAccess.tier === 'super_admin' && showOverrides && (
                <div className={styles.overrideGrid}>
                  {FEATURE_CATALOG.map((item) => {
                    const planVal = selectedPlan ? selectedPlan.features[item.key] : true;
                    const ov = featureOverrides[item.key];
                    const selectVal = ov === undefined ? 'default' : ov ? 'true' : 'false';
                    return (
                      <div key={item.key} className={styles.overrideRow}>
                        <span>
                          {item.label}{' '}
                          <span style={{ color: '#64748b' }}>({planVal ? 'On' : 'Off'})</span>
                        </span>
                        <select
                          className={styles.overrideSelect}
                          value={selectVal}
                          onChange={(e) =>
                            setOverrideValue(item.key, e.target.value as 'default' | 'true' | 'false')
                          }
                        >
                          <option value="default">Plan default</option>
                          <option value="true">Force ON</option>
                          <option value="false">Force OFF</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Support Staff: Assigned Clients */}
          {isSupportStaffRole && callerAccess.tier === 'super_admin' && (
            <div className={styles.sectionBox}>
              <div className={styles.sectionTitle}>
                <span>Assigned Client Admins ({assignedClientIds.length} selected)</span>
                <button
                  type="button"
                  className={styles.overrideSelect}
                  onClick={() =>
                    setAssignedClientIds(
                      assignedClientIds.length === clientAdmins.length
                        ? []
                        : clientAdmins.map((c) => c.id)
                    )
                  }
                >
                  {assignedClientIds.length === clientAdmins.length ? 'Clear All' : 'Select All'}
                </button>
              </div>
              {clientAdmins.length === 0 ? (
                <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  No Client Admins created yet.
                </div>
              ) : (
                <div className={styles.checkListBox}>
                  {clientAdmins.map((client) => (
                    <label key={client.id} className={styles.checkItem}>
                      <input
                        type="checkbox"
                        checked={assignedClientIds.includes(client.id)}
                        onChange={() => setAssignedClientIds((prev) => toggleId(prev, client.id))}
                      />
                      <span>
                        {client.full_name} ({client.purchase_plan_name ?? 'No plan'})
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tenant Sub-User (Photographer / Coordinator / etc.): Workspace + Event Scope */}
          {isTenantSubUserRole && (
            <div className={styles.sectionBox}>
              <div className={styles.sectionTitle}>
                <span>Event Scope &amp; Tenant Workspace</span>
                {tenantEvents.length > 0 && (
                  <button
                    type="button"
                    className={styles.overrideSelect}
                    onClick={() =>
                      setAssignedEventIds(
                        assignedEventIds.length === tenantEvents.length
                          ? []
                          : tenantEvents.map((ev) => ev.id)
                      )
                    }
                  >
                    {assignedEventIds.length === tenantEvents.length ? 'Clear All' : 'Select All Events'}
                  </button>
                )}
              </div>

              {(callerAccess.tier === 'super_admin' || callerAccess.tier === 'super_staff') && (
                <div>
                  <label className={styles.label}>Parent Client Admin Workspace *</label>
                  <select
                    className={styles.select}
                    value={selectedTenantOwnerId}
                    disabled={mode === 'edit'}
                    onChange={(e) => {
                      setSelectedTenantOwnerId(e.target.value);
                      setAssignedEventIds([]);
                    }}
                  >
                    <option value="">Select client admin</option>
                    {clientAdmins.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name} ({c.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {tenantEvents.length === 0 ? (
                <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  No active events found for this workspace yet.
                </div>
              ) : (
                <div className={styles.checkListBox}>
                  {tenantEvents.map((ev) => (
                    <label key={ev.id} className={styles.checkItem}>
                      <input
                        type="checkbox"
                        checked={assignedEventIds.includes(ev.id)}
                        onChange={() => setAssignedEventIds((prev) => toggleId(prev, ev.id))}
                      />
                      <span>
                        {ev.title} ({ev.event_code})
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Granular Permissions Override */}
          {selectedRole && (
            <div className={styles.sectionBox}>
              <div className={styles.sectionTitle}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={useCustomPerms}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setUseCustomPerms(next);
                      if (next && customPerms.size === 0) {
                        setCustomPerms(new Set(selectedRole.permissions));
                      }
                    }}
                  />
                  <span>Customize granular permissions for this user</span>
                </label>
                {useCustomPerms && (
                  <button
                    type="button"
                    className={styles.overrideSelect}
                    onClick={() => setCustomPerms(new Set(selectedRole.permissions))}
                  >
                    Reset to Role Defaults
                  </button>
                )}
              </div>

              {!useCustomPerms ? (
                <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                  Using default permissions from role <strong>{formatRoleName(selectedRole.name)}</strong>, automatically filtered by purchased plan features.
                </div>
              ) : (
                <div className={styles.permBox}>
                  {PERM_GROUPS.map((grp) => (
                    <div key={grp.key} className={styles.permGroup}>
                      <div className={styles.permGroupTitle}>{grp.label}</div>
                      <div className={styles.permGrid}>
                        {PERMISSION_CATALOG.filter((p) => p.group === grp.key).map((item) => {
                          const reqFeat = PERMISSION_REQUIRED_FEATURE[item.key];
                          const blockedByPlan = Boolean(
                            reqFeat && (isClientAdminRole || isTenantSubUserRole) && !targetClientFeatures[reqFeat]
                          );
                          const blockedByCaller =
                            callerAccess.tier !== 'super_admin' &&
                            !callerAccess.permissions.includes(item.key);
                          const disabled = blockedByPlan || blockedByCaller;
                          return (
                            <label
                              key={item.key}
                              className={`${styles.permOption} ${disabled ? styles.permOptionDisabled : ''}`}
                              title={
                                blockedByPlan
                                  ? 'Feature disabled on client purchase plan'
                                  : blockedByCaller
                                  ? 'Not enabled for your account'
                                  : undefined
                              }
                            >
                              <input
                                type="checkbox"
                                disabled={disabled}
                                checked={!disabled && customPerms.has(item.key)}
                                onChange={() => togglePerm(item.key)}
                              />
                              <span>{item.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className={styles.formActions}>
            <button type="button" onClick={onClose} className={styles.btnCancel}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} className={styles.btnSubmit}>
              {submitting
                ? mode === 'create'
                  ? 'Creating…'
                  : 'Saving…'
                : mode === 'create'
                  ? 'Create user'
                  : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
