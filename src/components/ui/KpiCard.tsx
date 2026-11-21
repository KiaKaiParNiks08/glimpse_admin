import React from 'react';
import styles from './KpiCard.module.scss';

export interface KpiCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  subtitle?: string;
  variant?: 'primary' | 'success' | 'warning' | 'info' | 'purple';
  onClick?: () => void;
}

export function KpiCard({
  label,
  value,
  icon,
  subtitle,
  variant = 'primary',
  onClick,
}: KpiCardProps) {
  return (
    <div
      className={`${styles.card} ${onClick ? styles.clickable : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className={styles.topRow}>
        <span className={styles.label}>{label}</span>
        <div className={`${styles.iconWrap} ${styles[variant]}`}>{icon}</div>
      </div>
      <div className={styles.valueRow}>
        <span className={styles.value}>{value}</span>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      </div>
    </div>
  );
}
