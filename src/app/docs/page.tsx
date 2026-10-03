'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';

const SWAGGER_CDN = 'https://unpkg.com/swagger-ui-dist@5';
const SPEC_URL = '/api/docs/openapi';

declare global {
  interface Window {
    SwaggerUIBundle?: {
      (config: Record<string, unknown>): unknown;
      presets?: { apis: unknown };
    };
    SwaggerUIStandalonePreset?: unknown;
  }
}

export default function DocsPage() {
  const [scriptsLoaded, setScriptsLoaded] = useState(0);
  const initRef = useRef(false);
  const ready = scriptsLoaded >= 2;

  useEffect(() => {
    if (!ready || initRef.current) return;
    const Bundle = window.SwaggerUIBundle;
    const StandalonePreset = window.SwaggerUIStandalonePreset;
    if (!Bundle || !StandalonePreset) return;
    initRef.current = true;
    const specUrl = `${window.location.origin}${SPEC_URL}`;
    Bundle({
      url: specUrl,
      dom_id: '#swagger-ui-root',
      deepLinking: true,
      presets: [Bundle.presets?.apis, StandalonePreset].filter(Boolean),
      layout: 'StandaloneLayout',
    });
  }, [ready]);

  return (
    <>
      <link rel="stylesheet" href={`${SWAGGER_CDN}/swagger-ui.css`} />
      <Script
        src={`${SWAGGER_CDN}/swagger-ui-bundle.js`}
        strategy="afterInteractive"
        onLoad={() => setScriptsLoaded((n) => n + 1)}
      />
      <Script
        src={`${SWAGGER_CDN}/swagger-ui-standalone-preset.js`}
        strategy="afterInteractive"
        onLoad={() => setScriptsLoaded((n) => n + 1)}
      />
      <div style={{ height: '100vh', overflow: 'auto' }}>
        {!ready && (
          <div style={{ padding: '2rem', fontFamily: 'system-ui', textAlign: 'center' }}>
            Loading API documentation…
          </div>
        )}
        <div id="swagger-ui-root" />
      </div>
    </>
  );
}
