import test from 'node:test';
import assert from 'node:assert/strict';

test('event team formatting and mobile POC contract', async (t) => {
  await t.test('formats team contacts with dual keys for mobile compatibility', () => {
    function formatContact(row: {
      name: string;
      phone: string | null;
      email: string | null;
      image_url: string | null;
    } | null) {
      if (!row) return null;
      return {
        name: row.name,
        phone: row.phone,
        contact_phone: row.phone,
        email: row.email,
        contact_email: row.email,
        image_url: row.image_url,
        logo_url: row.image_url,
      };
    }

    const planner = formatContact({
      name: 'Grand Planner Co',
      phone: '+91 9876543210',
      email: 'planner@example.com',
      image_url: 'https://cdn.glimpse.app/planner.jpg',
    });

    const photographer = formatContact({
      name: 'Lens Studios',
      phone: '+91 9123456780',
      email: 'studio@example.com',
      image_url: 'https://cdn.glimpse.app/photo.jpg',
    });

    assert.equal(planner?.name, 'Grand Planner Co');
    assert.equal(planner?.contact_phone, '+91 9876543210');
    assert.equal(planner?.phone, '+91 9876543210');
    assert.equal(planner?.contact_email, 'planner@example.com');
    assert.equal(planner?.email, 'planner@example.com');
    assert.equal(planner?.logo_url, 'https://cdn.glimpse.app/planner.jpg');
    assert.equal(planner?.image_url, 'https://cdn.glimpse.app/planner.jpg');

    assert.equal(photographer?.name, 'Lens Studios');
    assert.equal(photographer?.logo_url, 'https://cdn.glimpse.app/photo.jpg');
  });

  await t.test('dashboard organizers falls back to planner when event_organizers is empty', () => {
    const planner = {
      name: 'Top Event Planner',
      phone: '+91 9876543210',
      email: 'planner@example.com',
      image_url: 'https://cdn.glimpse.app/planner.jpg',
    };

    function resolveDashboardOrganizers(
      dbOrganizers: Array<{ name: string; contact_phone: string | null; logo_url: string | null }>,
      teamPlanner: typeof planner | null
    ) {
      if (dbOrganizers.length > 0) return dbOrganizers;
      if (teamPlanner) {
        return [
          {
            id: 'event-planner',
            name: teamPlanner.name,
            logo_url: teamPlanner.image_url ?? '',
            contact_email: teamPlanner.email ?? '',
            contact_phone: teamPlanner.phone ?? '',
            website_url: '',
          },
        ];
      }
      return [];
    }

    // Empty organizers with planner present -> synthesizes POC
    const withFallback = resolveDashboardOrganizers([], planner);
    assert.equal(withFallback.length, 1);
    assert.equal(withFallback[0].name, 'Top Event Planner');
    assert.equal(withFallback[0].logo_url, 'https://cdn.glimpse.app/planner.jpg');
    assert.equal(withFallback[0].contact_phone, '+91 9876543210');

    // Explicit organizers take precedence if present
    const customOrganizer = [{ name: 'Custom Host', contact_phone: '+91 0000', logo_url: '' }];
    const withoutFallback = resolveDashboardOrganizers(customOrganizer, planner);
    assert.equal(withoutFallback.length, 1);
    assert.equal(withoutFallback[0].name, 'Custom Host');
  });

  await t.test('resolves event_id from query param or fallback to token event_id', () => {
    function resolveEventId(queryParam: string | null, tokenEventId: string | null | undefined): string | null {
      return (queryParam || tokenEventId)?.trim() || null;
    }

    assert.equal(resolveEventId('evt-1', 'evt-2'), 'evt-1'); // Query param takes precedence
    assert.equal(resolveEventId(null, 'evt-2'), 'evt-2'); // Falls back to token
    assert.equal(resolveEventId('', 'evt-2'), 'evt-2'); // Empty string falls back to token
    assert.equal(resolveEventId(null, undefined), null); // Neither -> null
  });
});
