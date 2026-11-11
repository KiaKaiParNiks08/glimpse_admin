'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import styles from '@/app/dashboard/notifications/notifications.module.scss';
import {
  getEventsForNotificationAction,
  getEventGuestsForNotificationAction,
  sendAdminPushNotificationAction,
  type NotificationEventOption,
  type NotificationRecipientItem,
} from '@/app/actions/notifications';
import { uploadNotificationImageAction } from '@/app/actions/upload';

export interface PushNotificationSenderProps {
  /** When set, scopes the sender strictly to this event (no multi-event picker). */
  lockedEventId?: string;
}

export function PushNotificationSender({ lockedEventId }: PushNotificationSenderProps) {
  const isEventLocked = Boolean(lockedEventId);

  // Event & Guest State
  const [events, setEvents] = useState<NotificationEventOption[]>([]);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(
    () => (lockedEventId ? new Set([lockedEventId]) : new Set())
  );
  const [eventSearchQuery, setEventSearchQuery] = useState('');
  const [guests, setGuests] = useState<NotificationRecipientItem[]>([]);
  const [recipientMode, setRecipientMode] = useState<'all' | 'custom'>('all');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  // Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [bulkFilterText, setBulkFilterText] = useState('');
  const [deviceFilter, setDeviceFilter] = useState<'all' | 'push_ready' | 'no_token' | 'unregistered'>('all');

  // Form State
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Status / Feedback State
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingGuests, setLoadingGuests] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [resultAlert, setResultAlert] = useState<{
    type: 'success' | 'error';
    message: string;
    stats?: {
      inAppCount: number;
      deviceTokensCount: number;
      pushSuccessCount: number;
      pushFailureCount: number;
      missingTokenUsersCount: number;
      failureSamples: string[];
    };
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Load accessible events on mount
  useEffect(() => {
    setLoadingEvents(true);
    getEventsForNotificationAction()
      .then((res) => {
        if (res.ok) {
          setEvents(res.data);
          if (lockedEventId) {
            setSelectedEventIds(new Set([lockedEventId]));
          } else if (res.data.length > 0) {
            setSelectedEventIds(new Set([res.data[0].id]));
          }
        }
      })
      .catch((err) => console.error('Failed to load events:', err))
      .finally(() => setLoadingEvents(false));
  }, [lockedEventId]);

  // 2. Fetch guests when selected events change
  useEffect(() => {
    const ids = Array.from(selectedEventIds);
    if (ids.length === 0) {
      setGuests([]);
      setSelectedUserIds(new Set());
      return;
    }

    setLoadingGuests(true);
    setResultAlert(null);
    getEventGuestsForNotificationAction({ eventIds: ids })
      .then((res) => {
        if (res.ok) {
          setGuests(res.data);
          setSelectedUserIds(new Set(res.data.map((g) => g.id)));
        } else {
          setGuests([]);
          setSelectedUserIds(new Set());
          setResultAlert({ type: 'error', message: res.error });
        }
      })
      .catch((err) => {
        console.error('Failed to load guests:', err);
        setGuests([]);
      })
      .finally(() => setLoadingGuests(false));
  }, [selectedEventIds]);

  // Switch between All vs Custom recipient modes cleanly
  function handleModeChange(mode: 'all' | 'custom') {
    setRecipientMode(mode);
    if (mode === 'all') {
      setSelectedUserIds(new Set(guests.map((g) => g.id)));
    }
  }

  // Filtered events matching search
  const filteredEvents = useMemo(() => {
    if (!eventSearchQuery.trim()) return events;
    const q = eventSearchQuery.toLowerCase().trim();
    return events.filter(
      (e) => e.title.toLowerCase().includes(q) || e.event_code.toLowerCase().includes(q)
    );
  }, [events, eventSearchQuery]);

  const selectedEvents = useMemo(
    () => events.filter((e) => selectedEventIds.has(e.id)),
    [events, selectedEventIds]
  );

  // 3. Filtered guests
  const filteredGuests = useMemo(() => {
    return guests.filter((g) => {
      if (deviceFilter === 'push_ready' && !g.has_fcm_token) return false;
      if (deviceFilter === 'no_token' && !(g.has_active_device && !g.has_fcm_token)) return false;
      if (deviceFilter === 'unregistered' && g.has_active_device) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = g.full_name.toLowerCase().includes(q);
        const matchesEmail = g.email.toLowerCase().includes(q);
        const matchesMobile = g.mobile_number.includes(q) || g.raw_mobile.includes(q);
        if (!matchesName && !matchesEmail && !matchesMobile) return false;
      }

      return true;
    });
  }, [guests, deviceFilter, searchQuery]);

  // Bulk matching logic for mobile numbers / emails
  function handleApplyBulkMatch() {
    if (!bulkFilterText.trim()) return;

    const terms = bulkFilterText
      .split(/[\s,;\n]+/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    if (terms.length === 0) return;

    setRecipientMode('custom');
    const matchedIds = new Set(selectedUserIds);
    let newlySelected = 0;

    for (const guest of guests) {
      const email = guest.email.toLowerCase();
      const rawMobile = guest.raw_mobile;

      const isMatch = terms.some((term) => {
        const cleanTerm = term.replace(/\D/g, '');
        if (cleanTerm && (rawMobile.endsWith(cleanTerm) || cleanTerm.endsWith(rawMobile))) {
          return true;
        }
        return email === term || email.includes(term);
      });

      if (isMatch) {
        if (!matchedIds.has(guest.id)) {
          matchedIds.add(guest.id);
          newlySelected++;
        }
      }
    }

    setSelectedUserIds(matchedIds);
    setResultAlert({
      type: 'success',
      message: `Selected ${newlySelected} matching guests based on provided contacts. Total selected: ${matchedIds.size}.`,
    });
  }

  // Selection handlers
  function toggleUser(id: string) {
    setRecipientMode('custom');
    const next = new Set(selectedUserIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedUserIds(next);
  }

  function handleSelectAllFiltered() {
    setRecipientMode('custom');
    const next = new Set(selectedUserIds);
    for (const g of filteredGuests) {
      next.add(g.id);
    }
    setSelectedUserIds(next);
  }

  function handleSelectAllPushReady() {
    setRecipientMode('custom');
    const next = new Set<string>();
    for (const g of guests) {
      if (g.has_fcm_token) {
        next.add(g.id);
      }
    }
    setSelectedUserIds(next);
  }

  function handleDeselectAll() {
    setRecipientMode('custom');
    setSelectedUserIds(new Set());
  }

  // Image Upload handler (auto-optimized JPEG/PNG under 800KB for reliable Android & iOS push delivery)
  async function handleImageFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    setResultAlert(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await uploadNotificationImageAction(formData);
      if (res.ok) {
        setImageUrl(res.url);
      } else {
        setResultAlert({ type: 'error', message: res.error || 'Failed to upload image' });
      }
    } catch {
      setResultAlert({ type: 'error', message: 'Image upload failed' });
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const effectiveTargetUserIds = useMemo(
    () => (recipientMode === 'all' ? guests.map((g) => g.id) : Array.from(selectedUserIds)),
    [recipientMode, guests, selectedUserIds]
  );

  // Send Notification
  async function handleSendNotification(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setResultAlert({ type: 'error', message: 'Please enter a notification title' });
      return;
    }
    if (!body.trim()) {
      setResultAlert({ type: 'error', message: 'Please enter a notification message body' });
      return;
    }
    if (effectiveTargetUserIds.length === 0) {
      setResultAlert({ type: 'error', message: 'Please select at least one recipient user' });
      return;
    }
    if (selectedEventIds.size === 0) {
      setResultAlert({ type: 'error', message: 'Please select at least one event' });
      return;
    }

    const targetSet = new Set(effectiveTargetUserIds);
    const pushReadyCount = guests.filter((g) => targetSet.has(g.id) && g.has_fcm_token).length;
    const eventNames = selectedEvents.map((ev) => ev.title).join(', ') || 'Selected Event';
    const confirmMsg = `Send notification to ${effectiveTargetUserIds.length} guest(s) for ${eventNames}?\n(${pushReadyCount} have active push tokens; all ${effectiveTargetUserIds.length} will receive an in-app notification).`;
    if (!window.confirm(confirmMsg)) {
      return;
    }

    setIsSending(true);
    setResultAlert(null);

    try {
      const res = await sendAdminPushNotificationAction({
        eventIds: Array.from(selectedEventIds),
        userIds: effectiveTargetUserIds,
        title: title.trim(),
        body: body.trim(),
        imageUrl: imageUrl.trim() || null,
      });

      if (res.ok) {
        const stats = res.data;
        setResultAlert({
          type: 'success',
          message: `Dispatched! Saved in-app notifications for ${stats.inAppCount} user(s); sent push to ${stats.pushSuccessCount} device(s).`,
          stats,
        });
        setTitle('');
        setBody('');
        setImageUrl('');
      } else {
        setResultAlert({ type: 'error', message: res.error || 'Failed to dispatch notification' });
      }
    } catch (err) {
      console.error('Send notification error:', err);
      setResultAlert({ type: 'error', message: 'An unexpected error occurred while sending notification' });
    } finally {
      setIsSending(false);
    }
  }

  const pushReadyCount = useMemo(() => guests.filter((g) => g.has_fcm_token).length, [guests]);
  const noTokenLoggedInCount = useMemo(
    () => guests.filter((g) => g.has_active_device && !g.has_fcm_token).length,
    [guests]
  );
  const selectedPushReadyCount = useMemo(() => {
    const targetSet = new Set(effectiveTargetUserIds);
    return guests.filter((g) => targetSet.has(g.id) && g.has_fcm_token).length;
  }, [guests, effectiveTargetUserIds]);

  const lockedEvent = selectedEvents[0] ?? null;

  return (
    <div className={styles.page}>
      {/* Page Header */}
      <div className={styles.headerRow}>
        <div className={styles.headerText}>
          <h1>
            <svg className={styles.notificationIcon} viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z" />
            </svg>
            {isEventLocked ? `Event Push Notifications${lockedEvent ? ` — ${lockedEvent.title}` : ''}` : 'Push Notifications'}
          </h1>
          <p>
            {isEventLocked
              ? 'Send push and in-app notifications exclusively to all or selected guests of this event.'
              : 'Compose and send targeted push notifications and in-app updates to guests of your events.'}
          </p>
        </div>
        {isEventLocked && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Link href="/dashboard/events" className={styles.smBtn}>
              ← Back to Events
            </Link>
            <Link
              href={`/dashboard/events/addEditEvent?mode=edit&eventId=${encodeURIComponent(lockedEventId!)}`}
              className={styles.smBtn}
            >
              Edit Event
            </Link>
          </div>
        )}
      </div>

      {/* Result / Error Banner */}
      {resultAlert && (
        <div className={`${styles.resultAlert} ${styles[resultAlert.type]}`}>
          <div>
            <strong>{resultAlert.type === 'success' ? 'Success: ' : 'Error: '}</strong>
            {resultAlert.message}
            {resultAlert.stats && (
              <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', opacity: 0.92 }}>
                • In-App Saved: {resultAlert.stats.inAppCount} | Push Tokens Targeted:{' '}
                {resultAlert.stats.deviceTokensCount} | Delivered: {resultAlert.stats.pushSuccessCount}
                {resultAlert.stats.pushFailureCount > 0 && ` | Failed: ${resultAlert.stats.pushFailureCount}`}
                {resultAlert.stats.missingTokenUsersCount > 0 &&
                  ` | Users Missing Push Token: ${resultAlert.stats.missingTokenUsersCount}`}
                {resultAlert.stats.failureSamples.length > 0 && (
                  <div style={{ marginTop: '0.25rem', color: '#991b1b' }}>
                    FCM Failure Details: {resultAlert.stats.failureSamples.join(' • ')}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Grid: Left = Event & Audience Selection, Right = Message Composer & Preview */}
      <div className={styles.gridContainer}>
        {/* LEFT COLUMN: Target Selection */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Card 1: Event Selector (Hidden or compact banner when locked to a single event) */}
          {!isEventLocked && (
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2>1. Select Target Events</h2>
                {selectedEvents.length > 0 ? (
                  <span className={`${styles.badge} ${styles.success}`}>
                    {selectedEvents.length} event{selectedEvents.length === 1 ? '' : 's'} selected
                  </span>
                ) : (
                  <span className={`${styles.badge} ${styles.warning}`}>None selected</span>
                )}
              </div>

              {loadingEvents ? (
                <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Loading events...</p>
              ) : events.length === 0 ? (
                <div className={styles.emptyState}>No active events available to your account.</div>
              ) : (
                <div className={styles.fieldGroup}>
                  <div className={styles.eventSearchWrapper}>
                    <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <circle cx="11" cy="11" r="8" strokeWidth="2" />
                      <path d="M21 21l-4.35-4.35" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <input
                      type="text"
                      className={styles.eventSearchInput}
                      placeholder="Search events by title or code..."
                      value={eventSearchQuery}
                      onChange={(e) => setEventSearchQuery(e.target.value)}
                    />
                    {eventSearchQuery && (
                      <button
                        type="button"
                        className={styles.clearSearchBtn}
                        onClick={() => setEventSearchQuery('')}
                        title="Clear search"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <div className={styles.eventActionsRow}>
                    <div className={styles.eventCountLabel}>
                      {selectedEventIds.size === 0 ? (
                        <span style={{ color: '#ef4444', fontWeight: 600 }}>No events selected</span>
                      ) : (
                        <span>
                          <strong>{selectedEventIds.size}</strong> of {events.length} event{events.length === 1 ? '' : 's'} selected
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        type="button"
                        className={styles.actionPill}
                        onClick={() => setSelectedEventIds(new Set(events.map((e) => e.id)))}
                      >
                        Select All ({events.length})
                      </button>
                      <button
                        type="button"
                        className={styles.actionPill}
                        onClick={() => setSelectedEventIds(new Set())}
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  {selectedEvents.length > 0 && (
                    <div className={styles.selectedEventChips}>
                      {selectedEvents.map((ev) => (
                        <span key={ev.id} className={styles.eventChip}>
                          <span className={styles.chipCode}>{ev.event_code}</span>
                          <span className={styles.chipTitle} title={ev.title}>
                            {ev.title}
                          </span>
                          <button
                            type="button"
                            className={styles.chipRemove}
                            onClick={() => {
                              const next = new Set(selectedEventIds);
                              next.delete(ev.id);
                              setSelectedEventIds(next);
                            }}
                            title={`Remove ${ev.title}`}
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className={styles.eventDropdownList}>
                    {filteredEvents.length === 0 ? (
                      <div className={styles.noEventsMatch}>
                        No events matching &ldquo;{eventSearchQuery}&rdquo;
                      </div>
                    ) : (
                      filteredEvents.map((ev) => {
                        const isChecked = selectedEventIds.has(ev.id);
                        return (
                          <label
                            key={ev.id}
                            className={`${styles.eventCheckItem} ${isChecked ? styles.checked : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                const next = new Set(selectedEventIds);
                                if (isChecked) {
                                  next.delete(ev.id);
                                } else {
                                  next.add(ev.id);
                                }
                                setSelectedEventIds(next);
                              }}
                            />
                            {ev.cover_image ? (
                              <img src={ev.cover_image} alt="" className={styles.eventCheckThumb} />
                            ) : (
                              <div className={styles.eventCheckThumbPlaceholder} />
                            )}
                            <div className={styles.eventCheckDetails}>
                              <div className={styles.eventCheckTitleRow}>
                                <span className={styles.eventCheckTitle}>{ev.title}</span>
                                <span className={styles.eventCheckCode}>{ev.event_code}</span>
                              </div>
                              <span className={styles.eventCheckDates}>
                                {new Date(ev.start_date).toLocaleDateString()}
                                {ev.status && ` • ${ev.status.toUpperCase()}`}
                              </span>
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Card 2: Recipient Users Filter & Table */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2>{isEventLocked ? '1. Select Audience' : '2. Select Recipients'}</h2>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span className={`${styles.badge} ${styles.success}`}>
                  {effectiveTargetUserIds.length} / {guests.length} targeted
                </span>
                <span className={styles.badge} title="Guests with valid FCM push tokens">
                  🔔 {pushReadyCount} push ready
                </span>
                {noTokenLoggedInCount > 0 && (
                  <span className={`${styles.badge} ${styles.warning}`} title="Logged in without FCM token">
                    ⚠ {noTokenLoggedInCount} missing token
                  </span>
                )}
              </div>
            </div>

            {/* All Guests vs Select Specific Users */}
            <div className={styles.btnGroup}>
              <button
                type="button"
                className={`${styles.smBtn} ${recipientMode === 'all' ? styles.active : ''}`}
                onClick={() => handleModeChange('all')}
              >
                All Event Users ({guests.length})
              </button>
              <button
                type="button"
                className={`${styles.smBtn} ${recipientMode === 'custom' ? styles.active : ''}`}
                onClick={() => handleModeChange('custom')}
              >
                Select Specific Users ({selectedUserIds.size})
              </button>
            </div>

            {/* Quick Bulk Filter by Mobile / Email */}
            <div className={styles.fieldGroup}>
              <label>
                <span>Select by Mobile Number(s) or Email(s)</span>
                <span style={{ fontWeight: 400, color: '#64748b', fontSize: '0.75rem' }}>
                  Paste comma or space separated
                </span>
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  className={styles.input}
                  placeholder="e.g. 9876543210, guest@example.com, +1 555-0199"
                  value={bulkFilterText}
                  onChange={(e) => setBulkFilterText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleApplyBulkMatch())}
                />
                <button
                  type="button"
                  className={styles.smBtn}
                  onClick={handleApplyBulkMatch}
                  style={{ whiteSpace: 'nowrap', background: '#f8fafc' }}
                >
                  Select Matching
                </button>
              </div>
            </div>

            {/* Controls & Search */}
            <div className={styles.filterControls}>
              <input
                type="text"
                className={styles.input}
                placeholder="Search guests by name, phone or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />

              <div className={styles.filterActions}>
                <div className={styles.btnGroup}>
                  <button
                    type="button"
                    className={`${styles.smBtn} ${deviceFilter === 'all' ? styles.active : ''}`}
                    onClick={() => setDeviceFilter('all')}
                  >
                    All ({guests.length})
                  </button>
                  <button
                    type="button"
                    className={`${styles.smBtn} ${deviceFilter === 'push_ready' ? styles.active : ''}`}
                    onClick={() => setDeviceFilter('push_ready')}
                  >
                    🔔 Push Ready ({pushReadyCount})
                  </button>
                  {noTokenLoggedInCount > 0 && (
                    <button
                      type="button"
                      className={`${styles.smBtn} ${deviceFilter === 'no_token' ? styles.active : ''}`}
                      onClick={() => setDeviceFilter('no_token')}
                    >
                      ⚠ App No Token ({noTokenLoggedInCount})
                    </button>
                  )}
                  <button
                    type="button"
                    className={`${styles.smBtn} ${deviceFilter === 'unregistered' ? styles.active : ''}`}
                    onClick={() => setDeviceFilter('unregistered')}
                  >
                    Web / In-App ({guests.length - pushReadyCount - noTokenLoggedInCount})
                  </button>
                </div>

                <div className={styles.btnGroup}>
                  <button type="button" className={styles.smBtn} onClick={handleSelectAllFiltered}>
                    Select Filtered
                  </button>
                  <button type="button" className={styles.smBtn} onClick={handleSelectAllPushReady}>
                    Select Push Ready
                  </button>
                  <button type="button" className={styles.smBtn} onClick={handleDeselectAll}>
                    Deselect All
                  </button>
                </div>
              </div>
            </div>

            {/* Guests Table */}
            {loadingGuests ? (
              <div className={styles.emptyState}>Loading event guests...</div>
            ) : filteredGuests.length === 0 ? (
              <div className={styles.emptyState}>
                {guests.length === 0
                  ? 'No logged-in guests found for this event yet.'
                  : 'No guests match the current search/filter.'}
              </div>
            ) : (
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th style={{ width: '36px' }}>
                        <input
                          type="checkbox"
                          checked={
                            filteredGuests.length > 0 &&
                            filteredGuests.every((g) =>
                              recipientMode === 'all' ? true : selectedUserIds.has(g.id)
                            )
                          }
                          onChange={(e) => {
                            if (e.target.checked) handleSelectAllFiltered();
                            else {
                              setRecipientMode('custom');
                              const next = new Set(selectedUserIds);
                              for (const g of filteredGuests) next.delete(g.id);
                              setSelectedUserIds(next);
                            }
                          }}
                        />
                      </th>
                      <th>Guest</th>
                      {!isEventLocked && <th>Event</th>}
                      <th>Mobile Number</th>
                      <th>Email</th>
                      <th>Push Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGuests.map((guest) => {
                      const isSelected = recipientMode === 'all' || selectedUserIds.has(guest.id);
                      return (
                        <tr
                          key={guest.id}
                          className={isSelected ? styles.selectedRow : ''}
                          onClick={() => toggleUser(guest.id)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleUser(guest.id)}
                            />
                          </td>
                          <td>
                            <div className={styles.userCell}>
                              {guest.avatar_url ? (
                                <img src={guest.avatar_url} alt="" className={styles.avatar} />
                              ) : (
                                <div className={styles.avatar}>
                                  {guest.full_name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div>
                                <div className={styles.userName}>{guest.full_name}</div>
                              </div>
                            </div>
                          </td>
                          {!isEventLocked && (
                            <td>
                              <div className={styles.guestEventPills}>
                                {guest.event_names.map((name, i) => (
                                  <span key={i} className={styles.guestEventPill} title={name}>
                                    {name}
                                  </span>
                                ))}
                              </div>
                            </td>
                          )}
                          <td>
                            <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                              {guest.mobile_number || '—'}
                            </span>
                          </td>
                          <td>
                            <span style={{ color: '#475569', fontSize: '0.8rem' }}>
                              {guest.email || '—'}
                            </span>
                          </td>
                          <td>
                            {guest.has_fcm_token ? (
                              <span
                                className={`${styles.badge} ${styles.success}`}
                                title={`Push ready (${guest.device_types.join(', ')})`}
                              >
                                ● {guest.device_types.map((t) => t.toUpperCase()).join('/') || 'PUSH'}
                              </span>
                            ) : guest.has_active_device ? (
                              <span
                                className={`${styles.badge} ${styles.warning}`}
                                title="Logged in on mobile app, but FCM push token is missing (notification permission denied or APNs missing). Receives in-app notification."
                              >
                                ⚠ No Push Token
                              </span>
                            ) : (
                              <span
                                className={`${styles.badge} ${styles.neutral}`}
                                title="No mobile device registered yet; will receive in-app notification"
                              >
                                In-App Only
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Composer & Mobile Lockscreen Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <form className={styles.card} onSubmit={handleSendNotification}>
            <div className={styles.cardHeader}>
              <h2>{isEventLocked ? '2. Compose Notification' : '3. Compose Notification'}</h2>
            </div>

            <div className={styles.fieldGroup}>
              <label>
                <span>Notification Title *</span>
                <span className={styles.charCount}>{title.length} / 150</span>
              </label>
              <input
                type="text"
                className={styles.input}
                placeholder="e.g. Sangeet Ceremony Starts in 30 Mins! 🎶"
                maxLength={150}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className={styles.fieldGroup}>
              <label>
                <span>Message Body *</span>
                <span className={styles.charCount}>{body.length} / 500</span>
              </label>
              <textarea
                className={styles.textarea}
                placeholder="e.g. Head over to the Grand Ballroom. Refreshments and live music are ready!"
                maxLength={500}
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
              />
            </div>

            <div className={styles.fieldGroup}>
              <label>
                <span>Notification Image (Optional)</span>
                {imageUrl && (
                  <button
                    type="button"
                    onClick={() => setImageUrl('')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ef4444',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    Remove
                  </button>
                )}
              </label>

              {imageUrl ? (
                <div className={styles.imagePreviewWrapper}>
                  <img src={imageUrl} alt="Notification Attachment" />
                  <button
                    type="button"
                    className={styles.removeImgBtn}
                    onClick={() => setImageUrl('')}
                    title="Remove Image"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <>
                  <div
                    className={styles.uploadDropzone}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      style={{ display: 'none' }}
                      onChange={handleImageFileChange}
                    />
                    {isUploadingImage ? (
                      <span style={{ color: '#3b82f6', fontSize: '0.85rem' }}>
                        Optimizing &amp; uploading image...
                      </span>
                    ) : (
                      <div>
                        <svg
                          style={{ width: 28, height: 28, color: '#94a3b8', margin: '0 auto 0.25rem' }}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                        </svg>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#334155' }}>
                          Click to upload an image
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                          Auto-optimized JPEG/PNG for Android &amp; iOS lockscreens
                        </div>
                      </div>
                    )}
                  </div>

                  <input
                    type="text"
                    className={styles.input}
                    style={{ fontSize: '0.78rem', marginTop: '0.25rem' }}
                    placeholder="Or paste an https:// image link (optional)..."
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                  />
                </>
              )}
            </div>

            <button
              type="submit"
              className={styles.submitBtn}
              disabled={isSending || effectiveTargetUserIds.length === 0 || !title.trim() || !body.trim()}
            >
              {isSending ? (
                <span>Dispatching Notifications...</span>
              ) : (
                <>
                  <svg style={{ width: 18, height: 18 }} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                  <span>
                    Send Push to {effectiveTargetUserIds.length} User
                    {effectiveTargetUserIds.length === 1 ? '' : 's'}
                    {selectedPushReadyCount > 0 ? ` (${selectedPushReadyCount} Push Ready)` : ''}
                  </span>
                </>
              )}
            </button>
          </form>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2>{isEventLocked ? '3. Live Mobile Notification Preview' : '4. Live Mobile Notification Preview'}</h2>
              <span className={styles.badge}>Lockscreen Simulation</span>
            </div>

            <div className={styles.previewPhoneCard}>
              <div className={styles.pushCard}>
                <div className={styles.pushHeader}>
                  <div className={styles.appBrand}>
                    <div className={styles.appIcon} />
                    <span>
                      Glimpse •{' '}
                      {selectedEvents.length === 1
                        ? selectedEvents[0].title
                        : selectedEvents.length > 1
                        ? `${selectedEvents[0].title} (+${selectedEvents.length - 1} more)`
                        : 'Select Events'}
                    </span>
                  </div>
                  <span>now</span>
                </div>

                <div className={styles.pushTitle}>{title.trim() || 'Notification Title'}</div>

                <div className={styles.pushBody}>
                  {body.trim() || 'Your message preview will appear here as you type.'}
                </div>

                {imageUrl.trim() && (
                  <img src={imageUrl.trim()} alt="" className={styles.pushImage} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
