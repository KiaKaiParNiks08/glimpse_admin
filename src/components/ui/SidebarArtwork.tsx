import React from 'react';
import styles from './SidebarArtwork.module.scss';

export interface SidebarArtworkProps {
  collapsed?: boolean;
}

export function SidebarArtwork({ collapsed = false }: SidebarArtworkProps) {
  if (collapsed) return null;

  return (
    <div className={styles.container} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/glimpsapp-sidebar-art.svg"
        alt=""
        className={styles.image}
      />
      <div className={styles.overlay} />
    </div>
  );
}
