import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  ANDROID_SHA256_PLACEHOLDER,
  IOS_TEAM_ID_PLACEHOLDER,
  androidAppLinksReady,
  androidStoreUrl,
  buildAppleAppSiteAssociation,
  buildAssetLinks,
  customSchemeUrl,
  extractJoinEventCode,
  iosStoreUrl,
  iosUniversalLinksReady,
  joinPageAccess,
  joinUrl,
  jsonAssociation,
  platformFromUserAgent,
} from './app-share.ts';

const envKeys = [
  'APP_PUBLIC_URL',
  'APP_BASE_URL',
  'VERCEL_PROJECT_PRODUCTION_URL',
  'VERCEL_URL',
  'ANDROID_PACKAGE_NAME',
  'ANDROID_PLAY_STORE_URL',
  'ANDROID_SHA256_CERT_FINGERPRINTS',
  'IOS_BUNDLE_ID',
  'IOS_TEAM_ID',
  'IOS_APP_STORE_URL',
  'APP_URL_SCHEME',
] as const;

const previous: Record<string, string | undefined> = {};

function saveEnv() {
  for (const key of envKeys) previous[key] = process.env[key];
}

function restoreEnv() {
  for (const key of envKeys) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
}

describe('event share links', () => {
  afterEach(() => {
    restoreEnv();
  });

  it('builds a canonical https join URL and leaves the event code unchanged', () => {
    saveEnv();
    process.env.APP_PUBLIC_URL = 'https://glimpse-admin-ecru.vercel.app';
    delete process.env.APP_BASE_URL;
    assert.equal(joinUrl('BIRTHDAY123'), 'https://glimpse-admin-ecru.vercel.app/join/BIRTHDAY123');
    assert.equal(customSchemeUrl('BIRTHDAY123'), 'glimps://join?event_code=BIRTHDAY123');
    assert.doesNotMatch(joinUrl('BIRTHDAY123'), /^glimps:/);
  });

  it('encodes the Play Install Referrer and keeps the package id', () => {
    saveEnv();
    process.env.ANDROID_PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=app.glimps';
    const url = new URL(androidStoreUrl('BIRTHDAY123'));
    assert.equal(url.hostname, 'play.google.com');
    assert.equal(url.searchParams.get('id'), 'app.glimps');
    assert.equal(url.searchParams.get('referrer'), 'event_code=BIRTHDAY123');
    assert.match(url.toString(), /referrer=event_code%3DBIRTHDAY123/);
  });

  it('keeps an existing Play query param and does not duplicate the event code', () => {
    saveEnv();
    process.env.ANDROID_PLAY_STORE_URL =
      'https://play.google.com/store/apps/details?id=app.glimps&referrer=utm_source%3Dqr';
    const first = new URL(androidStoreUrl('BIRTHDAY123'));
    assert.equal(first.searchParams.get('id'), 'app.glimps');
    assert.equal(first.searchParams.get('referrer'), 'utm_source=qr&event_code=BIRTHDAY123');
    process.env.ANDROID_PLAY_STORE_URL = first.toString();
    const second = new URL(androidStoreUrl('BIRTHDAY123'));
    assert.equal(second.searchParams.get('referrer'), 'utm_source=qr&event_code=BIRTHDAY123');
  });

  it('rejects an event code that is not safe to place in a store URL', () => {
    saveEnv();
    assert.throws(() => androidStoreUrl('a b'), /Invalid event code/);
    assert.throws(() => androidStoreUrl('../admin'), /Invalid event code/);
  });

  it('selects the store from the device and keeps the iOS listing free of the event code', () => {
    saveEnv();
    process.env.IOS_APP_STORE_URL = 'https://apps.apple.com/app/id0000000000';
    assert.equal(platformFromUserAgent('Mozilla/5.0 (Linux; Android 14)'), 'android');
    assert.equal(platformFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'ios');
    assert.equal(platformFromUserAgent('Mozilla/5.0 (Macintosh)'), 'other');
    const ios = new URL(iosStoreUrl());
    assert.equal(ios.hostname, 'apps.apple.com');
    assert.equal(ios.searchParams.get('event_code'), null);
    assert.equal(ios.searchParams.get('referrer'), null);
  });

  it('refuses missing, invalid, cancelled, and rewritten event codes', () => {
    const event = { event_code: 'BIRTHDAY123', status: 'published' };
    assert.deepEqual(joinPageAccess({ code: 'BIRTHDAY123', event }), { ok: true, eventCode: 'BIRTHDAY123' });
    assert.deepEqual(joinPageAccess({ code: 'BIRTHDAY123', event: null }), { ok: false });
    assert.deepEqual(joinPageAccess({ code: 'bad code', event }), { ok: false });
    assert.deepEqual(joinPageAccess({ code: '%', event }), { ok: false });
    assert.deepEqual(joinPageAccess({ code: 'BIRTHDAY123', event: { ...event, status: 'cancelled' } }), { ok: false });
    assert.deepEqual(joinPageAccess({ code: 'BIRTHDAY123', event: { ...event, status: 'archived' } }), { ok: false });
    assert.deepEqual(
      joinPageAccess({ code: 'birthday123', event: { event_code: 'BIRTHDAY123', status: 'published' } }),
      { ok: false }
    );
  });

  it('serves the Android association file with a placeholder until a real fingerprint is configured', async () => {
    saveEnv();
    delete process.env.ANDROID_SHA256_CERT_FINGERPRINTS;
    process.env.ANDROID_PACKAGE_NAME = 'app.glimps';
    assert.equal(androidAppLinksReady(), false);
    const body = buildAssetLinks();
    assert.equal(body[0]?.target.package_name, 'app.glimps');
    assert.deepEqual(body[0]?.target.sha256_cert_fingerprints, [ANDROID_SHA256_PLACEHOLDER]);
    const response = jsonAssociation(body);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/json');
    assert.deepEqual(await response.json(), body);
  });

  it('uses a real Play App Signing fingerprint when one is configured', () => {
    saveEnv();
    const fingerprint = 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99';
    process.env.ANDROID_SHA256_CERT_FINGERPRINTS = fingerprint;
    process.env.ANDROID_PACKAGE_NAME = 'app.glimps';
    assert.equal(androidAppLinksReady(), true);
    assert.deepEqual(buildAssetLinks()[0]?.target.sha256_cert_fingerprints, [fingerprint]);
  });

  it('serves the iOS association file without a .json name and without inventing a Team ID', async () => {
    saveEnv();
    delete process.env.IOS_TEAM_ID;
    process.env.IOS_BUNDLE_ID = 'app.glimps';
    assert.equal(iosUniversalLinksReady(), false);
    const body = buildAppleAppSiteAssociation();
    assert.deepEqual(body.applinks.details[0]?.appIDs, [`${IOS_TEAM_ID_PLACEHOLDER}.app.glimps`]);
    assert.deepEqual(body.applinks.details[0]?.components, [{ '/': '/join/*' }]);
    const response = jsonAssociation(body);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/json');
    assert.deepEqual(await response.json(), body);
  });

  it('reads the event code from a raw code, join URL, app scheme, or store referrer', () => {
    assert.deepEqual(extractJoinEventCode('BIRTHDAY123'), { event_code: 'BIRTHDAY123' });
    assert.deepEqual(extractJoinEventCode('  BIRTHDAY123  '), { event_code: 'BIRTHDAY123' });
    assert.deepEqual(
      extractJoinEventCode('https://glimpse-admin-ecru.vercel.app/join/BIRTHDAY123'),
      { event_code: 'BIRTHDAY123', event_id: undefined }
    );
    assert.deepEqual(extractJoinEventCode('glimps://join?event_code=BIRTHDAY123'), {
      event_code: 'BIRTHDAY123',
      event_id: undefined,
    });
    const eventId = '11111111-1111-4111-8111-111111111111';
    assert.deepEqual(
      extractJoinEventCode(
        `https://play.google.com/store/apps/details?id=app.glimps&referrer=event_code%3DBIRTHDAY123%26event_id%3D${eventId}`
      ),
      { event_code: 'BIRTHDAY123', event_id: eventId }
    );
    assert.deepEqual(
      extractJoinEventCode(`https://apps.apple.com/app/id0000000000?event_code=BIRTHDAY123&event_id=${eventId}`),
      { event_code: 'BIRTHDAY123', event_id: eventId }
    );
    assert.deepEqual(extractJoinEventCode(''), {});
  });

  it('uses a verified Apple Team ID when configured', () => {
    saveEnv();
    process.env.IOS_TEAM_ID = 'AB12CD34EF';
    process.env.IOS_BUNDLE_ID = 'app.glimps';
    assert.equal(iosUniversalLinksReady(), true);
    assert.deepEqual(buildAppleAppSiteAssociation().applinks.details[0]?.appIDs, ['AB12CD34EF.app.glimps']);
  });
});
