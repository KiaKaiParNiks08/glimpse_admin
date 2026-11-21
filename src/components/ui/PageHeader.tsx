import React from 'react';
import Link from 'next/link';
import { ChevronRight } from '@/components/icons';
import styles from './PageHeader.module.scss';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  description?: string;
  badge?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  description,
  badge,
  breadcrumbs,
  actions,
}: PageHeaderProps) {
  const sub = subtitle ?? description;
  return (
    <div className={styles.header}>
      <div className={styles.left}>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <span key={idx} className={styles.crumbItem}>
                  {crumb.href && !isLast ? (
                    <Link href={crumb.href} className={styles.crumbLink}>
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className={styles.crumbCurrent}>{crumb.label}</span>
                  )}
                  {!isLast && <ChevronRight size={13} className={styles.crumbSeparator} />}
                </span>
              );
            })}
          </nav>
        )}
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{title}</h1>
          {badge}
        </div>
        {sub && <p className={styles.subtitle}>{sub}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
