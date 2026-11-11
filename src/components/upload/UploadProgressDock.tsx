'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useDashboardUploads } from './DashboardUploadProvider';
import styles from './UploadProgressDock.module.scss';

export function UploadProgressDock() {
  const { jobs, hasActiveUploads, cancelJob, dismissJob, clearCompletedJobs } =
    useDashboardUploads();
  const [minimized, setMinimized] = useState(false);
  const [expandedJobIds, setExpandedJobIds] = useState<Set<string>>(new Set());

  if (jobs.length === 0) return null;

  const activeCount = jobs.filter((j) => j.status === 'running').length;

  function toggleJobDetails(jobId: string) {
    setExpandedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }

  return (
    <aside className={styles.dock} aria-label="Background media uploads">
      <div className={styles.dockHeader}>
        <div className={styles.dockTitleWrap}>
          <span className={styles.dockTitle}>
            {hasActiveUploads
              ? `Uploading media (${activeCount} active batch${activeCount > 1 ? 'es' : ''})`
              : 'Session media uploads'}
          </span>
          <span className={styles.dockSubtitle}>
            {hasActiveUploads
              ? 'Safe to navigate pages — uploads stay active'
              : 'All queued batches finished'}
          </span>
        </div>
        <div className={styles.dockHeaderActions}>
          {!hasActiveUploads && jobs.length > 0 && (
            <button type="button" className={styles.headerBtn} onClick={clearCompletedJobs}>
              Clear
            </button>
          )}
          <button
            type="button"
            className={styles.headerBtn}
            onClick={() => setMinimized((v) => !v)}
          >
            {minimized ? 'Show' : 'Hide'}
          </button>
        </div>
      </div>

      {!minimized && (
        <div className={styles.jobList}>
          {jobs.map((job) => {
            const pct =
              job.totalFiles > 0
                ? Math.min(100, Math.round((job.processedCount / job.totalFiles) * 100))
                : 100;
            const issues = [...job.excludedItems, ...job.failedItems];
            const isExpanded = expandedJobIds.has(job.id);
            const fillClass =
              job.status === 'running'
                ? styles.progressFill
                : job.status === 'completed'
                ? `${styles.progressFill} ${styles.progressFillDone}`
                : `${styles.progressFill} ${styles.progressFillWarn}`;

            return (
              <div key={job.id} className={styles.jobCard}>
                <div className={styles.jobTop}>
                  <div className={styles.jobMeta}>
                    <div className={styles.jobEvent}>
                      <Link href={`/dashboard/events/${job.eventId}/media`}>{job.eventTitle}</Link>
                    </div>
                    <div className={styles.jobSession}>{job.sessionLabel}</div>
                  </div>
                  {job.status === 'running' ? (
                    <button
                      type="button"
                      className={styles.jobActionBtn}
                      onClick={() => cancelJob(job.id)}
                    >
                      Stop
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.jobActionBtn}
                      onClick={() => dismissJob(job.id)}
                    >
                      Dismiss
                    </button>
                  )}
                </div>

                <div className={styles.progressTrack}>
                  <div className={fillClass} style={{ width: `${pct}%` }} />
                </div>

                <div className={styles.statsRow}>
                  <span>
                    {job.processedCount}/{job.totalFiles} checked
                  </span>
                  <span className={styles.statOk}>{job.uploadedCount} saved</span>
                  {job.blockedCount > 0 && (
                    <span className={styles.statWarn}>{job.blockedCount} excluded (18+/unsupported)</span>
                  )}
                  {job.failedCount > 0 && (
                    <span className={styles.statErr}>{job.failedCount} failed</span>
                  )}
                </div>

                {job.status === 'running' && job.activeFiles.length > 0 && (
                  <div className={styles.activeNames}>
                    Processing: {job.activeFiles.join(', ')}
                  </div>
                )}

                {issues.length > 0 && (
                  <>
                    <button
                      type="button"
                      className={styles.issuesToggle}
                      onClick={() => toggleJobDetails(job.id)}
                    >
                      {isExpanded
                        ? 'Hide excluded / failed files'
                        : `View ${issues.length} excluded / failed file(s)`}
                    </button>
                    {isExpanded && (
                      <div className={styles.issuesBox}>
                        {issues.slice(0, 40).map((item, idx) => (
                          <div key={`${item.name}-${idx}`} className={styles.issueRow}>
                            <strong>{item.name}:</strong> {item.reason}
                          </div>
                        ))}
                        {issues.length > 40 && (
                          <div className={styles.issueRow}>
                            …and {issues.length - 40} more item(s).
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
