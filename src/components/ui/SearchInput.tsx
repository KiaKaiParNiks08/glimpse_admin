'use client';

import React from 'react';
import { Search, X } from '@/components/icons';
import styles from './SearchInput.module.scss';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  className,
}: SearchInputProps) {
  return (
    <div className={`${styles.searchWrap} ${className || ''}`}>
      <Search size={15} className={styles.searchIcon} />
      <input
        type="text"
        className={styles.input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button
          type="button"
          className={styles.clearBtn}
          onClick={() => onChange('')}
          aria-label="Clear search"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
