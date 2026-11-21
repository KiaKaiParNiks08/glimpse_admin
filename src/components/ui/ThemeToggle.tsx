'use client';

import React from 'react';
import { useTheme } from '@/components/theme/ThemeProvider';
import { Sun, Moon } from '@/components/icons';
import styles from './ThemeToggle.module.scss';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      className={styles.toggleBtn}
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'}
      aria-label="Toggle color theme"
    >
      {theme === 'dark' ? (
        <Sun size={17} className={styles.iconSun} />
      ) : (
        <Moon size={17} className={styles.iconMoon} />
      )}
    </button>
  );
}
