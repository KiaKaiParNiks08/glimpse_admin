'use client';

import { useMemo } from 'react';
import styles from './PaginatedTable.module.scss';

type PageNumber = number | 'ellipsis';

export type PaginatedTableProps = {
  /** Header row: usually a <tr> with <th> cells. */
  header: React.ReactNode;
  /** Body rows: a list of <tr> elements. */
  children: React.ReactNode;
  /** Current page (1-based). */
  page: number;
  /** Total number of pages. */
  totalPages: number;
  /** Total number of items across all pages. */
  total: number;
  /** Page size (items per page). */
  pageSize: number;
  /** Number of table columns (for colspan in empty/loading rows). */
  colSpan: number;
  /** Whether the table is currently loading. */
  loading?: boolean;
  /** Message to show while loading. */
  loadingMessage?: string;
  /** Message to show when there is no data. */
  emptyMessage?: string;
  /** Called when the user changes page. */
  onPageChange: (page: number) => void;
};

const PAGINATION_WINDOW = 2;

export function PaginatedTable({
  header,
  children,
  page,
  totalPages,
  total,
  pageSize,
  colSpan,
  loading,
  loadingMessage = 'Loading…',
  emptyMessage = 'No records found.',
  onPageChange,
}: PaginatedTableProps) {
  const pageNumbers: PageNumber[] = useMemo(() => {
    const list: PageNumber[] = [];
    const half = PAGINATION_WINDOW;
    if (totalPages <= half * 2 + 3) {
      for (let i = 1; i <= totalPages; i++) list.push(i);
      return list;
    }
    list.push(1);
    if (page > half + 2) list.push('ellipsis');
    for (let i = Math.max(2, page - half); i <= Math.min(totalPages - 1, page + half); i++) {
      list.push(i);
    }
    if (page < totalPages - half - 1) list.push('ellipsis');
    if (totalPages > 1) list.push(totalPages);
    return list;
  }, [page, totalPages]);

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const showEmpty = !loading && total === 0;

  return (
    <>
      <div className={styles.wrapper}>
        <table className={styles.table}>
          <thead className={styles.headRow}>{header}</thead>
          <tbody>
            {loading && total === 0 ? (
              Array.from({ length: 6 }, (_, index) => (
                <tr key={index}>
                  <td colSpan={colSpan} className={styles.cell}>
                    <span className={styles.skeletonBar} aria-hidden="true" />
                    {index === 0 && <span className={styles.srOnly}>{loadingMessage}</span>}
                  </td>
                </tr>
              ))
            ) : showEmpty ? (
              <tr>
                <td colSpan={colSpan} className={styles.emptyCell}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              children
            )}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className={styles.paginationBar}>
          <span className={styles.paginationSummary}>
            Showing {from}–{to} of {total}
          </span>
          <div className={styles.pagination}>
            <button
              type="button"
              onClick={() => onPageChange(1)}
              disabled={page <= 1 || loading}
              className={styles.paginationButton}
              aria-label="First page"
            >
              First
            </button>
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page <= 1 || loading}
              className={styles.paginationButton}
              aria-label="Previous page"
            >
              Prev
            </button>
            {pageNumbers.map((p, i) =>
              p === 'ellipsis' ? (
                <span key={`ell-${i}`} className={styles.paginationEllipsis}>
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => onPageChange(p)}
                  disabled={loading}
                  className={`${styles.paginationButton} ${
                    page === p ? styles.paginationButtonActive : ''
                  }`}
                  aria-label={`Page ${p}`}
                  aria-current={page === p ? 'page' : undefined}
                >
                  {p}
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages || loading}
              className={styles.paginationButton}
              aria-label="Next page"
            >
              Next
            </button>
            <button
              type="button"
              onClick={() => onPageChange(totalPages)}
              disabled={page >= totalPages || loading}
              className={styles.paginationButton}
              aria-label="Last page"
            >
              Last
            </button>
          </div>
        </div>
      )}
    </>
  );
}