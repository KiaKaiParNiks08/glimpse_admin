'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { adminBearerAuthHeader } from '@/lib/admin-jwt-client';
import { KpiCard } from '@/components/ui/KpiCard';
import {
  Calendar,
  Users,
  Building2,
  Compass,
  Key,
  Shield,
  Plus,
  Bell,
  CreditCard,
  Sparkles,
} from '@/components/icons';
import styles from './dashboard-charts.module.css';

type DashboardStats = {
  eventsByStatus: { status: string; count: number }[];
  eventsCreatedByMonth: { month: string; count: number }[];
  assignedAdminsPerEvent: { title: string; count: number }[];
  totals: {
    events: number;
    venues: number;
    exploreCategories: number;
    exploreItems: number;
    totalEventAdminAssignments: number;
    superAdmins?: number;
    eventAdmins?: number;
  };
};

const STATUS_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#64748b'];

function CustomChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number | string; color?: string; fill?: string }>;
  label?: string;
}) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        padding: '8px 12px',
        boxShadow: 'var(--shadow-card)',
        color: 'var(--text-primary)',
        fontSize: '12px',
      }}
    >
      {label && <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>}
      {payload.map((item, idx) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: item.color || item.fill || 'var(--primary-accent)',
              display: 'inline-block',
            }}
          />
          <span style={{ color: 'var(--text-secondary)' }}>{item.name}:</span>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function formatStatusLabel(status: string): string {
  if (!status) return 'Unknown';
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncateEventTitle(title: string, maxLen = 28): string {
  const t = title.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

type RangeMode = 'last_1' | 'last_3' | 'last_6' | 'custom';

function toYmdUTC(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function calcLastMonthsDateRangeYmd(months: number): { from: string; to: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return { from: toYmdUTC(start), to: toYmdUTC(end) };
}

function formatYmdForDisplay(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return ymd;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, monthIndex, day, 0, 0, 0, 0));
  return date.toLocaleDateString('en-US', { timeZone: 'UTC' });
}

export function DashboardCharts() {
  const last6Defaults = calcLastMonthsDateRangeYmd(6);
  const [rangeMode, setRangeMode] = useState<RangeMode>('last_6');
  const [fromDate, setFromDate] = useState<string>(last6Defaults.from);
  const [toDate, setToDate] = useState<string>(last6Defaults.to);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    setLoading(true);
    setError(null);

    const canFetch =
      rangeMode !== 'custom' ||
      (fromDate.trim() !== '' && toDate.trim() !== '' && fromDate <= toDate);

    if (!canFetch) {
      setLoading(false);
      setError('Please select a valid date range.');
      return;
    }

    const headers = adminBearerAuthHeader();
    if (!headers.Authorization) {
      setLoading(false);
      return;
    }

    const params = new URLSearchParams();
    params.set('range', rangeMode);
    if (rangeMode === 'custom') {
      params.set('from', fromDate);
      params.set('to', toDate);
    }

    fetch(`/api/admin/dashboard-stats?${params.toString()}`, { headers, signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 403 ? 'Forbidden' : 'Failed to load stats');
        type Body = { data?: DashboardStats; message?: string };
        const json = (await r.json()) as Body;
        const data = json.data;
        if (!data) throw new Error('Invalid response');
        if (!cancelled) setStats(data);
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load stats');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [rangeMode, fromDate, toDate]);

  const rangeLabel =
    rangeMode === 'custom'
      ? `${formatYmdForDisplay(fromDate)} to ${formatYmdForDisplay(toDate)}`
      : rangeMode === 'last_1'
        ? 'last 1 month'
        : rangeMode === 'last_3'
          ? 'last 3 months'
          : 'last 6 months';

  const eventsCreatedTitle = `Events created (${rangeLabel})`;
  const eventsByStatusTitle = `Events by status (${rangeLabel})`;

  const statusChartData = stats?.eventsByStatus.map((row) => ({
    name: formatStatusLabel(row.status),
    value: row.count,
  })) ?? [];

  const monthData = stats?.eventsCreatedByMonth ?? [];
  /** Largest count at top of horizontal bar chart (Recharts lists first row at bottom). */
  const assignedAdminsChartData = stats ? [...stats.assignedAdminsPerEvent].reverse() : [];

  return (
    <div className={styles.wrap}>
      <div className={styles.quickActionsRow}>
        <Link href="/dashboard/events/addEditEvent?mode=create" className={styles.quickActionBtn}>
          <Plus size={15} /> Create Event
        </Link>
        <Link href="/dashboard/venues" className={styles.quickActionBtn}>
          <Building2 size={15} /> Add Venue
        </Link>
        <Link href="/dashboard/plans" className={styles.quickActionBtn}>
          <CreditCard size={15} /> Manage Plans
        </Link>
        <Link href="/dashboard/notifications" className={styles.quickActionBtn}>
          <Bell size={15} /> Push Notification
        </Link>
      </div>

      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Time range</span>
          <div className={styles.rangeButtons}>
            <button
              type="button"
              className={`${styles.rangeBtn} ${rangeMode === 'last_1' ? styles.rangeBtnActive : ''}`}
              aria-pressed={rangeMode === 'last_1'}
              onClick={() => setRangeMode('last_1')}
            >
              Last 1 month
            </button>
            <button
              type="button"
              className={`${styles.rangeBtn} ${rangeMode === 'last_3' ? styles.rangeBtnActive : ''}`}
              aria-pressed={rangeMode === 'last_3'}
              onClick={() => setRangeMode('last_3')}
            >
              Last 3 months
            </button>
            <button
              type="button"
              className={`${styles.rangeBtn} ${rangeMode === 'last_6' ? styles.rangeBtnActive : ''}`}
              aria-pressed={rangeMode === 'last_6'}
              onClick={() => setRangeMode('last_6')}
            >
              Last 6 months
            </button>
            <button
              type="button"
              className={`${styles.rangeBtn} ${rangeMode === 'custom' ? styles.rangeBtnActive : ''}`}
              aria-pressed={rangeMode === 'custom'}
              onClick={() => setRangeMode('custom')}
            >
              Custom
            </button>
          </div>
        </div>

        <div className={styles.customRange}>
          <label className={styles.dateLabel}>
            <span className={styles.dateLabelText}>From</span>
            <input
              className={styles.dateInput}
              type="date"
              value={fromDate}
              disabled={rangeMode !== 'custom'}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </label>
          <label className={styles.dateLabel}>
            <span className={styles.dateLabelText}>To</span>
            <input
              className={styles.dateInput}
              type="date"
              value={toDate}
              disabled={rangeMode !== 'custom'}
              onChange={(e) => setToDate(e.target.value)}
            />
          </label>

          <div className={styles.rangeApplied}>
            <span className={styles.rangeAppliedLabel}>Applied:</span> <span>{rangeLabel}</span>
          </div>
        </div>
      </div>

      {loading ? (
        <>
          <div className={styles.statRow} aria-busy="true" aria-live="polite">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className={styles.statCard}>
                <span className={styles.skeletonValue} />
                <span className={styles.skeletonLabel} />
              </div>
            ))}
          </div>
          <div className={styles.chartsGrid}>
            <div className={styles.chartCard}>
              <span className={styles.skeletonChart} />
            </div>
            <div className={styles.chartCard}>
              <span className={styles.skeletonChart} />
            </div>
          </div>
        </>
      ) : error ? (
        <p className={styles.error}>{error}</p>
      ) : stats ? (
        <>
          <div className={styles.statRow}>
            <KpiCard
              label="Events"
              value={stats.totals.events}
              icon={<Calendar size={18} />}
              variant="primary"
            />
            <KpiCard
              label="Admin assignments"
              value={stats.totals.totalEventAdminAssignments}
              icon={<Users size={18} />}
              variant="purple"
            />
            <KpiCard
              label="Venues"
              value={stats.totals.venues}
              icon={<Building2 size={18} />}
              variant="info"
            />
            <KpiCard
              label="Explore categories"
              value={stats.totals.exploreCategories}
              icon={<Compass size={18} />}
              variant="warning"
            />
            <KpiCard
              label="Explore items"
              value={stats.totals.exploreItems}
              icon={<Sparkles size={18} />}
              variant="success"
            />
            {stats.totals.superAdmins != null && stats.totals.eventAdmins != null && (
              <>
                <KpiCard
                  label="Super admins"
                  value={stats.totals.superAdmins}
                  icon={<Shield size={18} />}
                  variant="primary"
                />
                <KpiCard
                  label="Event admin users"
                  value={stats.totals.eventAdmins}
                  icon={<Key size={18} />}
                  variant="purple"
                />
              </>
            )}
          </div>

          <div className={styles.chartsGrid}>
            <div className={styles.chartCard}>
              <h2 className={styles.chartTitle}>{eventsCreatedTitle}</h2>
              <div className={styles.chartArea}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(148,163,184,0.15)" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      axisLine={{ stroke: 'rgba(148,163,184,0.3)' }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      width={36}
                    />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Bar dataKey="count" name="Events" fill="var(--primary-accent)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={styles.chartCard}>
              <h2 className={styles.chartTitle}>{eventsByStatusTitle}</h2>
              <div className={styles.chartArea}>
                {statusChartData.length === 0 ? (
                  <p className={styles.muted}>No events in scope.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={80}
                        paddingAngle={2}
                      >
                        {statusChartData.map((_, i) => (
                          <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomChartTooltip />} />
                      <Legend
                        wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }}
                        formatter={(value) => <span style={{ color: 'var(--text-primary)' }}>{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className={`${styles.chartCard} ${styles.chartCardWide}`}>
              <h2 className={styles.chartTitle}>Assigned event admins by event</h2>
              <p className={styles.chartSubtitle}>
                {stats.totals.totalEventAdminAssignments} assignment
                {stats.totals.totalEventAdminAssignments === 1 ? '' : 's'} across{' '}
                {stats.assignedAdminsPerEvent.length} event
                {stats.assignedAdminsPerEvent.length === 1 ? '' : 's'} (in this time range; showing up to 15
                with assignments).
              </p>
              <div
                className={styles.chartAreaTall}
                style={{
                  minHeight: assignedAdminsChartData.length
                    ? Math.min(520, Math.max(200, assignedAdminsChartData.length * 36))
                    : undefined,
                }}
              >
                {assignedAdminsChartData.length === 0 ? (
                  <p className={styles.muted}>No event admins assigned to events in this scope.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={assignedAdminsChartData}
                      margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                    >
                      <CartesianGrid stroke="rgba(148,163,184,0.15)" horizontal={false} />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fill: '#64748b', fontSize: 12 }}
                        axisLine={{ stroke: 'rgba(148,163,184,0.3)' }}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="title"
                        width={132}
                        tick={{ fill: '#64748b', fontSize: 11 }}
                        tickFormatter={truncateEventTitle}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<CustomChartTooltip />} />
                      <Bar
                        dataKey="count"
                        name="Assigned admins"
                        fill="#8b5cf6"
                        radius={[0, 4, 4, 0]}
                        maxBarSize={22}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
