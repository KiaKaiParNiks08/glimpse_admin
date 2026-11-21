import React from 'react';
import styles from './StatusBadge.module.scss';

export type StatusVariant =
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral'
  | 'accent'
  | 'info'
  | 'gold';

export interface StatusBadgeProps {
  status: string;
  variant?: StatusVariant;
  label?: string;
  dot?: boolean;
  className?: string;
}

export function StatusBadge({
  status,
  variant,
  label,
  dot = false,
  className,
}: StatusBadgeProps) {
  const norm = (status || '').toLowerCase().trim();

  let resolvedVariant: StatusVariant = variant ?? 'neutral';
  if (!variant) {
    if (['published', 'active', 'ongoing', 'success', 'ready'].includes(norm)) {
      resolvedVariant = 'success';
    } else if (['cancelled', 'moderated', 'deleted', 'danger', 'inactive', 'failed', 'blocked'].includes(norm)) {
      resolvedVariant = 'danger';
    } else if (['archived', 'warning', 'pending', 'review'].includes(norm)) {
      resolvedVariant = 'warning';
    } else if (['global', 'platform', 'recommended', 'featured'].includes(norm)) {
      resolvedVariant = norm === 'recommended' || norm === 'featured' ? 'gold' : 'accent';
    } else if (['custom', 'client', 'info'].includes(norm)) {
      resolvedVariant = 'info';
    } else {
      resolvedVariant = 'neutral';
    }
  }

  const displayLabel = label ?? (norm.charAt(0).toUpperCase() + norm.slice(1));

  return (
    <span className={`${styles.badge} ${styles[resolvedVariant]} ${className || ''}`}>
      {dot && <span className={styles.dot} />}
      {displayLabel}
    </span>
  );
}
