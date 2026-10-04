import styles from './content-skeleton.module.css';

type ContentSkeletonProps = {
  variant?: 'table' | 'cards' | 'form';
};

/** Placeholder blocks for a page whose data has not arrived yet. */
export function ContentSkeleton({ variant = 'table' }: ContentSkeletonProps) {
  return (
    <div className={styles.wrap} aria-busy="true" aria-live="polite">
      <span className={styles.srOnly}>Loading</span>
      <div className={styles.title} />
      <div className={styles.subtitle} />
      {variant === 'table' && (
        <div className={styles.table}>
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className={styles.row} />
          ))}
        </div>
      )}
      {variant === 'cards' && (
        <div className={styles.cards}>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className={styles.card} />
          ))}
        </div>
      )}
      {variant === 'form' && (
        <div className={styles.form}>
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className={styles.field} />
          ))}
        </div>
      )}
    </div>
  );
}
