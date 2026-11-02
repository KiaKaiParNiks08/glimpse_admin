'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import styles from './notifications.module.scss';
import {
  getEventsForNotificationAction,
  getEventGuestsForNotificationAction,
  sendAdminPushNotificationAction,
  type NotificationEventOption,
  type NotificationRecipientItem,
} from '@/app/actions/notifications';
import { uploadFileServerAction } from '@/app/actions/upload';

export default function NotificationsPage() {
  // Event & Guest State
  const [events, setEvents] = useState<NotificationEventOption[]>([]);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [eventSearchQuery, setEventSearchQuery] = useState('');
  const [guests, setGuests] = useState<NotificationRecipientItem[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  // Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [bulkFilterText, setBulkFilterText] = useState('');
  const [deviceFilter, setDeviceFilter] = useState<'all' | 'reachable' | 'unregistered'>('all');

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
          if (res.data.length > 0) {
            setSelectedEventIds(new Set([res.data[0].id]));
          }
        }
      })
      .catch((err) => console.error('Failed to load events:', err))
      .finally(() => setLoadingEvents(false));
  }, []);

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
          // By default, select all guests that have registered app devices
          const reachableIds = res.data.filter((g) => g.has_active_device).map((g) => g.id);
          setSelectedUserIds(new Set(reachableIds.length > 0 ? reachableIds : res.data.map((g) => g.id)));
        } else {
          setGuests([]);
          setSelectedUserIds(new Set());
        }
      })
      .catch((err) => {
        console.error('Failed to load guests:', err);
        setGuests([]);
      })
      .finally(() => setLoadingGuests(false));
  }, [selectedEventIds]);

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
      // Device filter
      if (deviceFilter === 'reachable' && !g.has_active_device) return false;
      if (deviceFilter === 'unregistered' && g.has_active_device) return false;

      // Search query
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
    const next = new Set(selectedUserIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedUserIds(next);
  }

  function handleSelectAllFiltered() {
    const next = new Set(selectedUserIds);
    for (const g of filteredGuests) {
      next.add(g.id);
    }
    setSelectedUserIds(next);
  }

  function handleSelectAllReachable() {
    const next = new Set<string>();
    for (const g of guests) {
      if (g.has_active_device) {
        next.add(g.id);
      }
    }
    setSelectedUserIds(next);
  }

  function handleDeselectAll() {
    setSelectedUserIds(new Set());
  }

  // Image Upload handler
  async function handleImageFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    setResultAlert(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('prefix', 'uploads');

    try {
      const res = await uploadFileServerAction(formData);
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
    if (selectedUserIds.size === 0) {
      setResultAlert({ type: 'error', message: 'Please select at least one recipient user' });
      return;
    }
    if (selectedEventIds.size === 0) {
      setResultAlert({ type: 'error', message: 'Please select at least one event' });
      return;
    }

    const selectedCount = selectedUserIds.size;
    const reachableSelectedCount = guests.filter((g) => selectedUserIds.has(g.id) && g.has_active_device).length;

    const eventNames = selectedEvents.map((e) => e.title).join(', ');
    const confirmMsg = `Send push notification to ${selectedCount} guest(s) across ${selectedEventIds.size} event(s) (${eventNames})?\n(${reachableSelectedCount} currently have the mobile app installed).`;
    if (!window.confirm(confirmMsg)) {
      return;
    }

    setIsSending(true);
    setResultAlert(null);

    try {
      const res = await sendAdminPushNotificationAction({
        eventIds: Array.from(selectedEventIds),
        userIds: Array.from(selectedUserIds),
        title: title.trim(),
        body: body.trim(),
        imageUrl: imageUrl.trim() || null,
      });

      if (res.ok) {
        const stats = res.data;
        setResultAlert({
          type: 'success',
          message: `Notification successfully dispatched! In-app notification saved for ${stats.inAppCount} user(s). Delivered push to ${stats.pushSuccessCount} mobile device(s).`,
          stats,
        });
        // Clear message fields on success
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

  const selectedEvent = selectedEvents[0] || null;
  const reachableCount = useMemo(() => guests.filter((g) => g.has_active_device).length, [guests]);
  const selectedReachableCount = useMemo(
    () => guests.filter((g) => selectedUserIds.has(g.id) && g.has_active_device).length,
    [guests, selectedUserIds]
  );

  return (
    <div className={styles.page}>
      {/* Page Header */}
      <div className={styles.headerRow}>
        <div className={styles.headerText}>
          <h1>
            <svg className={styles.notificationIcon} viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z" />
            </svg>
            Push Notifications
          </h1>
          <p>Compose and send targeted push notifications and in-app updates to guests of your events.</p>
        </div>
      </div>

      {/* Result / Error Banner */}
      {resultAlert && (
        <div className={`${styles.resultAlert} ${styles[resultAlert.type]}`}>
          <div>
            <strong>{resultAlert.type === 'success' ? 'Success: ' : 'Error: '}</strong>
            {resultAlert.message}
            {resultAlert.stats && (
              <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', opacity: 0.9 }}>
                • In-App Records: {resultAlert.stats.inAppCount} | Active Devices Targeted:{' '}
                {resultAlert.stats.deviceTokensCount} | Successful Pushes: {resultAlert.stats.pushSuccessCount}
                {resultAlert.stats.pushFailureCount > 0 && ` | Failed Pushes: ${resultAlert.stats.pushFailureCount}`}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Grid: Left = Event & Audience Selection, Right = Message Composer & Preview */}
      <div className={styles.gridContainer}>
        {/* LEFT COLUMN: Target Selection */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Card 1: Event Selector */}
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
                {/* Search Bar */}
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

                {/* Actions & Count Row */}
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

                {/* Selected Event Chips */}
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

                {/* Scrollable Checklist of Events */}
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

          {/* Card 2: Recipient Users Filter & Table */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2>2. Select Recipients</h2>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <span className={`${styles.badge} ${styles.success}`}>
                  {selectedUserIds.size} / {guests.length} selected
                </span>
                <span className={styles.badge} title="Guests with registered mobile devices">
                  📱 {reachableCount} on app
                </span>
              </div>
            </div>

            {/* Quick Bulk Filter by Mobile / Email */}
            <div className={styles.fieldGroup}>
              <label>
                <span>Filter or Select by Mobile Number(s) or Email(s)</span>
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
                    All Guests ({guests.length})
                  </button>
                  <button
                    type="button"
                    className={`${styles.smBtn} ${deviceFilter === 'reachable' ? styles.active : ''}`}
                    onClick={() => setDeviceFilter('reachable')}
                  >
                    📱 App Installed ({reachableCount})
                  </button>
                  <button
                    type="button"
                    className={`${styles.smBtn} ${deviceFilter === 'unregistered' ? styles.active : ''}`}
                    onClick={() => setDeviceFilter('unregistered')}
                  >
                    Web / Invitees ({guests.length - reachableCount})
                  </button>
                </div>

                <div className={styles.btnGroup}>
                  <button type="button" className={styles.smBtn} onClick={handleSelectAllFiltered}>
                    Select Filtered
                  </button>
                  <button type="button" className={styles.smBtn} onClick={handleSelectAllReachable}>
                    Select App Users
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
                            filteredGuests.every((g) => selectedUserIds.has(g.id))
                          }
                          onChange={(e) => {
                            if (e.target.checked) handleSelectAllFiltered();
                            else {
                              const next = new Set(selectedUserIds);
                              for (const g of filteredGuests) next.delete(g.id);
                              setSelectedUserIds(next);
                            }
                          }}
                        />
                      </th>
                      <th>Guest</th>
                      <th>Event</th>
                      <th>Mobile Number</th>
                      <th>Email</th>
                      <th>App Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGuests.map((guest) => {
                      const isSelected = selectedUserIds.has(guest.id);
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
                          <td>
                            <div className={styles.guestEventPills}>
                              {guest.event_names.map((name, i) => (
                                <span key={i} className={styles.guestEventPill} title={name}>
                                  {name}
                                </span>
                              ))}
                            </div>
                          </td>
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
                            {guest.has_active_device ? (
                              <span
                                className={`${styles.badge} ${styles.success}`}
                                title={`Logged in via ${guest.device_types.join(', ')}`}
                              >
                                ● {guest.device_types.map((t) => t.toUpperCase()).join('/') || 'APP'}
                              </span>
                            ) : (
                              <span
                                className={`${styles.badge} ${styles.neutral}`}
                                title="Has not logged in on mobile app yet; will receive in-app notification"
                              >
                                Web / Invited
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
          {/* Card 3: Notification Composer */}
          <form className={styles.card} onSubmit={handleSendNotification}>
            <div className={styles.cardHeader}>
              <h2>3. Compose Notification</h2>
            </div>

            {/* Title */}
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

            {/* Message Body */}
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

            {/* Optional Image */}
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
                      <span style={{ color: '#3b82f6', fontSize: '0.85rem' }}>Uploading image to S3...</span>
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
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>JPEG, PNG, WebP up to 10MB</div>
                      </div>
                    )}
                  </div>

                  <input
                    type="text"
                    className={styles.input}
                    style={{ fontSize: '0.78rem', marginTop: '0.25rem' }}
                    placeholder="Or paste an image link directly (optional)..."
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                  />
                </>
              )}
            </div>

            {/* Submit / Blast Button */}
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={isSending || selectedUserIds.size === 0 || !title.trim() || !body.trim()}
            >
              {isSending ? (
                <span>Dispatching Notifications...</span>
              ) : (
                <>
                  <svg style={{ width: 18, height: 18 }} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                  <span>
                    Send Push to {selectedUserIds.size} User{selectedUserIds.size === 1 ? '' : 's'}
                    {selectedReachableCount > 0 && ` (${selectedReachableCount} on App)`}
                  </span>
                </>
              )}
            </button>
          </form>

          {/* Card 4: Realistic Device Lockscreen Preview */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2>4. Live Mobile Notification Preview</h2>
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
