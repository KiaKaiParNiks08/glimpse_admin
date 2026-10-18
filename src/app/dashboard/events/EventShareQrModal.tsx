'use client';

import { useEffect, useState } from 'react';
import { getEventShareQrAction } from '@/app/actions/event-share';

type Props = {
  open: boolean;
  eventId: string | null;
  onClose: () => void;
};

export function EventShareQrModal({ open, eventId, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [eventCode, setEventCode] = useState('');
  const [joinUrl, setJoinUrl] = useState('');
  const [svg, setSvg] = useState('');

  useEffect(() => {
    if (!open || !eventId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSvg('');
    getEventShareQrAction(eventId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTitle(result.data.title);
      setEventCode(result.data.event_code);
      setJoinUrl(result.data.join_url);
      setSvg(result.data.svg);
    });
    return () => {
      cancelled = true;
    };
  }, [open, eventId]);

  if (!open) return null;

  function download() {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `event-${eventCode}-qr.svg`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Event share QR"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(420px, 100%)',
          background: '#fff',
          borderRadius: 12,
          padding: 20,
          color: '#0f172a',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700 }}>{title || 'Event QR'}</div>
            <div style={{ color: '#64748b', fontSize: 13 }}>{eventCode}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: 0, background: 'transparent', cursor: 'pointer' }}>
            ×
          </button>
        </div>
        {loading && <p>Preparing QR…</p>}
        {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
        {svg && (
          <>
            <div
              style={{ margin: '12px auto', width: 240, background: '#fff' }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <p style={{ fontSize: 13, wordBreak: 'break-all', color: '#475569' }}>{joinUrl}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={download}>
                Download SVG
              </button>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(joinUrl);
                }}
              >
                Copy link
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
