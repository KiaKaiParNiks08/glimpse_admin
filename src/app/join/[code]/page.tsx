import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import {
  androidIntentUrl,
  androidStoreUrl,
  customSchemeUrl,
  iosStoreUrl,
  joinPageAccess,
  platformFromUserAgent,
} from '@/lib/app-share';
import prisma from '@/server/prisma';

export const dynamic = 'force-dynamic';

export default async function JoinEventPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const raw = (await params).code || '';
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw).trim();
  } catch {
    notFound();
  }

  const event = await prisma.events.findUnique({
    where: { event_code: decoded },
    select: { title: true, event_code: true, status: true },
  });
  const access = joinPageAccess({ code: raw, event });
  if (!access.ok || !event) notFound();

  const code = access.eventCode;
  const requestHeaders = await headers();
  const platform = platformFromUserAgent(requestHeaders.get('user-agent') ?? '');
  const playStore = androidStoreUrl(code);
  const appStore = iosStoreUrl();
  const openApp = platform === 'android' ? androidIntentUrl(code) : customSchemeUrl(code);

  return (
    <main
      style={{
        minHeight: '100vh',
        margin: 0,
        padding: '2.5rem 1.25rem',
        background: '#f8fafc',
        color: '#0f172a',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: 420, margin: '0 auto' }}>
        <p style={{ margin: 0, letterSpacing: '0.08em', fontSize: 12, color: '#64748b' }}>GLIMPS</p>
        <h1 style={{ fontSize: '1.5rem', margin: '0.5rem 0 0.25rem' }}>{event.title}</h1>
        <p style={{ margin: '0 0 1.25rem', color: '#475569' }}>
          Event code <strong>{code}</strong>
        </p>
        <p style={{ margin: '0 0 1rem', lineHeight: 1.5 }}>
          If the app is installed, this HTTPS link opens it. This page stays available when the app is not installed.
        </p>
        <p style={{ margin: '0 0 1rem', lineHeight: 1.5 }}>
          {platform === 'ios'
            ? 'On iPhone, install from the App Store, then open this same link again. The App Store does not pass the event code through automatically.'
            : 'On Android, the Play Store link includes the event code in the install referrer. That reaches the app only after an install from Google Play.'}
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: '1.5rem', flexWrap: 'wrap' }}>
          <a href={openApp} style={linkStyle}>
            Open app
          </a>
          <a href={playStore} style={platform === 'android' ? linkStyle : secondaryStyle}>
            Play Store
          </a>
          <a href={appStore} style={platform === 'ios' ? linkStyle : secondaryStyle}>
            App Store
          </a>
        </div>
      </div>
    </main>
  );
}

const linkStyle = {
  display: 'inline-block',
  padding: '0.55rem 0.8rem',
  borderRadius: 8,
  background: '#0f172a',
  color: '#fff',
  textDecoration: 'none',
  fontSize: 14,
};

const secondaryStyle = {
  ...linkStyle,
  background: '#e2e8f0',
  color: '#0f172a',
};
