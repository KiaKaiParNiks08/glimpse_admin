import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import {
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

  const event = await prisma.events.findFirst({
    where: { event_code: { equals: decoded, mode: 'insensitive' } },
    select: { title: true, event_code: true, status: true },
  });
  const access = joinPageAccess({ code: raw, event });
  if (!access.ok || !event) notFound();

  const code = access.eventCode;
  const requestHeaders = await headers();
  const platform = platformFromUserAgent(requestHeaders.get('user-agent') ?? '');
  const playStore = androidStoreUrl(code);
  const appStore = iosStoreUrl(code);

  if (platform === 'android') redirect(playStore);
  if (platform === 'ios') redirect(appStore);

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
          Open this link on your phone to install the app, or open it in the Glimps app if it is already installed.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: '1.5rem', flexWrap: 'wrap' }}>
          <a href={customSchemeUrl(code)} style={linkStyle}>
            Open app
          </a>
          <a href={playStore} style={secondaryStyle}>
            Play Store
          </a>
          <a href={appStore} style={secondaryStyle}>
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
