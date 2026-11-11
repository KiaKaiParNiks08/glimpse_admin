'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ALL_FEATURES_ENABLED,
  createFeatureMap,
  FEATURE_CATALOG,
  FEATURE_KEYS,
  STARTER_MEDIA_FEATURES,
  type FeatureKey,
  type FeatureMap,
} from '@/lib/rbac';
import {
  createPurchasePlanAction,
  deletePurchasePlanAction,
  listPurchasePlansAction,
  updatePurchasePlanAction,
  type PurchasePlanItem,
} from '@/app/actions/plans';
import { useAdminAccess } from '@/components/auth/AdminAccessContext';
import { ContentSkeleton } from '@/components/navigation/ContentSkeleton';
import styles from './plans.module.scss';

const GROUP_LABELS: Record<'event' | 'media_ai' | 'mobile' | 'workspace', string> = {
  event: 'Core Event Modules',
  media_ai: 'Media, Watermark & AI Recognition',
  mobile: 'Mobile Guest Experience',
  workspace: 'Workspace & Team Controls',
};

export default function PurchasePlansPage() {
  const router = useRouter();
  const { access, hasPermission } = useAdminAccess();
  const [plans, setPlans] = useState<PurchasePlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PurchasePlanItem | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [maxEvents, setMaxEvents] = useState('');
  const [maxSubUsers, setMaxSubUsers] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isDefault, setIsDefault] = useState(false);
  const [features, setFeatures] = useState<FeatureMap>({ ...ALL_FEATURES_ENABLED });
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const canManage = hasPermission('plans.manage');

  useEffect(() => {
    if (!access) return;
    if (!canManage) {
      router.replace('/dashboard');
      return;
    }
    void loadPlans();
  }, [access, canManage, router]);

  async function loadPlans() {
    setLoading(true);
    setError(null);
    const res = await listPurchasePlansAction({ includeInactive: true });
    if (!res.ok) {
      setError(res.error);
    } else {
      setPlans(res.data);
    }
    setLoading(false);
  }

  function openCreate() {
    setEditingPlan(null);
    setName('');
    setDescription('');
    setMaxEvents('');
    setMaxSubUsers('');
    setIsActive(true);
    setIsDefault(false);
    setFeatures({ ...STARTER_MEDIA_FEATURES });
    setModalError(null);
    setModalOpen(true);
  }

  function openEdit(plan: PurchasePlanItem) {
    setEditingPlan(plan);
    setName(plan.name);
    setDescription(plan.description ?? '');
    setMaxEvents(plan.max_events != null ? String(plan.max_events) : '');
    setMaxSubUsers(plan.max_sub_users != null ? String(plan.max_sub_users) : '');
    setIsActive(plan.is_active);
    setIsDefault(plan.is_default);
    setFeatures({ ...plan.features });
    setModalError(null);
    setModalOpen(true);
  }

  function toggleFeature(key: FeatureKey) {
    setFeatures((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setModalError('Plan name is required');
      return;
    }
    const parsedMaxEvents = maxEvents.trim() ? Number.parseInt(maxEvents.trim(), 10) : null;
    const parsedMaxSub = maxSubUsers.trim() ? Number.parseInt(maxSubUsers.trim(), 10) : null;
    if (maxEvents.trim() && (!Number.isFinite(parsedMaxEvents) || (parsedMaxEvents ?? 0) < 0)) {
      setModalError('Max events must be a non-negative integer or blank for unlimited');
      return;
    }
    if (maxSubUsers.trim() && (!Number.isFinite(parsedMaxSub) || (parsedMaxSub ?? 0) < 0)) {
      setModalError('Max sub-users must be a non-negative integer or blank for unlimited');
      return;
    }

    setSaving(true);
    setModalError(null);
    try {
      if (editingPlan) {
        const res = await updatePurchasePlanAction(editingPlan.id, {
          name: name.trim(),
          description: description.trim() || null,
          features,
          max_events: parsedMaxEvents,
          max_sub_users: parsedMaxSub,
          is_active: isActive,
          is_default: isDefault,
        });
        if (!res.ok) throw new Error(res.error);
      } else {
        const res = await createPurchasePlanAction({
          name: name.trim(),
          description: description.trim() || null,
          features,
          max_events: parsedMaxEvents,
          max_sub_users: parsedMaxSub,
          is_active: isActive,
          is_default: isDefault,
        });
        if (!res.ok) throw new Error(res.error);
      }
      setModalOpen(false);
      await loadPlans();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Unable to save plan');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(plan: PurchasePlanItem) {
    if (!confirm(`Delete purchase plan "${plan.name}"?`)) return;
    setError(null);
    const res = await deletePurchasePlanAction(plan.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await loadPlans();
  }

  if (!access || loading) {
    return <ContentSkeleton />;
  }

  const groups: Array<'event' | 'media_ai' | 'mobile' | 'workspace'> = [
    'event',
    'media_ai',
    'mobile',
    'workspace',
  ];

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.headerText}>
          <h1>Purchase Plans &amp; Feature Bundles</h1>
          <p>
            Define subscription plans controlling event quotas, team size, dashboard tools, and mobile app features.
          </p>
        </div>
        <button type="button" className={styles.primaryBtn} onClick={openCreate}>
          + New Purchase Plan
        </button>
      </div>

      {error && <p className={styles.errorText}>{error}</p>}

      <div className={styles.planGrid}>
        {plans.map((plan) => {
          const enabledCount = FEATURE_KEYS.filter((k) => plan.features[k]).length;
          return (
            <div key={plan.id} className={styles.planCard}>
              <div className={styles.planCardTop}>
                <div>
                  <div className={styles.planTitle}>{plan.name}</div>
                  {plan.description && <div className={styles.planDesc}>{plan.description}</div>}
                </div>
                <div className={styles.badges}>
                  {plan.is_default && <span className={styles.badgeDefault}>Default</span>}
                  <span className={plan.is_active ? styles.badgeActive : styles.badgeInactive}>
                    {plan.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>

              <div className={styles.quotaRow}>
                <span>
                  Events: <strong>{plan.max_events == null ? 'Unlimited' : plan.max_events}</strong>
                </span>
                <span>
                  Team sub-users: <strong>{plan.max_sub_users == null ? 'Unlimited' : plan.max_sub_users}</strong>
                </span>
                <span>
                  Features: <strong>{enabledCount}/{FEATURE_KEYS.length}</strong>
                </span>
                <span>
                  Clients: <strong>{plan._count?.users ?? 0}</strong>
                </span>
              </div>

              <div className={styles.featureChips}>
                {FEATURE_CATALOG.map((item) => (
                  <span
                    key={item.key}
                    className={plan.features[item.key] ? styles.featureChipOn : styles.featureChipOff}
                  >
                    {item.label}
                  </span>
                ))}
              </div>

              <div className={styles.cardActions}>
                <button type="button" className={styles.secondaryBtn} onClick={() => openEdit(plan)}>
                  Edit Plan
                </button>
                <button
                  type="button"
                  className={styles.dangerBtn}
                  disabled={(plan._count?.users ?? 0) > 0}
                  title={
                    (plan._count?.users ?? 0) > 0
                      ? 'Reassign clients on this plan before deleting'
                      : 'Delete plan'
                  }
                  onClick={() => void handleDelete(plan)}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {modalOpen && (
        <div className={styles.overlay}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Purchase plan editor">
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>
                {editingPlan ? `Edit plan: ${editingPlan.name}` : 'Create purchase plan'}
              </h2>
              <button type="button" className={styles.closeBtn} onClick={() => setModalOpen(false)}>
                ×
              </button>
            </div>

            {modalError && <p className={styles.errorText}>{modalError}</p>}

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className={styles.formGrid}>
                <div>
                  <label className={styles.label}>Plan name *</label>
                  <input
                    className={styles.input}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Starter Media & Sessions"
                  />
                </div>
                <div>
                  <label className={styles.label}>Max events (blank = unlimited)</label>
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    value={maxEvents}
                    onChange={(e) => setMaxEvents(e.target.value)}
                    placeholder="Unlimited"
                  />
                </div>
                <div>
                  <label className={styles.label}>Max team sub-users (blank = unlimited)</label>
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    value={maxSubUsers}
                    onChange={(e) => setMaxSubUsers(e.target.value)}
                    placeholder="Unlimited"
                  />
                </div>
              </div>

              <div>
                <label className={styles.label}>Description</label>
                <textarea
                  className={styles.textarea}
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Summary of features included in this plan"
                />
              </div>

              <div className={styles.presetRow}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem' }}>
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                  Active
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', marginRight: 'auto' }}>
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                  />
                  Default plan for new clients
                </label>

                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setFeatures({ ...STARTER_MEDIA_FEATURES })}
                >
                  Preset: Starter Media Only
                </button>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setFeatures({ ...ALL_FEATURES_ENABLED })}
                >
                  Enable All
                </button>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setFeatures(createFeatureMap(false))}
                >
                  Clear All
                </button>
              </div>

              {groups.map((grp) => (
                <div key={grp} className={styles.groupSection}>
                  <div className={styles.groupTitle}>{GROUP_LABELS[grp]}</div>
                  <div className={styles.featureGrid}>
                    {FEATURE_CATALOG.filter((f) => f.group === grp).map((item) => (
                      <label key={item.key} className={styles.featureItem}>
                        <input
                          type="checkbox"
                          checked={features[item.key]}
                          onChange={() => toggleFeature(item.key)}
                        />
                        <span>
                          <strong>{item.label}</strong>
                          <span className={styles.featureItemDesc}>{item.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              <div className={styles.modalFooter}>
                <button type="button" className={styles.secondaryBtn} onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className={styles.primaryBtn} disabled={saving}>
                  {saving ? 'Saving…' : editingPlan ? 'Save Plan' : 'Create Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
