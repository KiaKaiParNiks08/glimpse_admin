-- Event categories for the "Category" dropdown on the event form (there is no admin UI for categories).
-- Slugs match the original CreateTable.sql seed; existing slugs are left untouched.
INSERT INTO "event_categories" ("name", "slug", "description") VALUES
  ('Wedding', 'wedding', 'Wedding ceremonies and celebrations'),
  ('Engagement', 'engagement', 'Engagement and ring ceremonies'),
  ('Reception', 'reception', 'Wedding or post-wedding receptions'),
  ('Baby Shower', 'baby-shower', 'Baby showers and godh bharai'),
  ('Birthday Party', 'birthday-party', 'Birthday parties and celebrations'),
  ('Anniversary', 'anniversary', 'Wedding and milestone anniversaries'),
  ('Naming Ceremony', 'naming-ceremony', 'Naming ceremonies and namkaran'),
  ('Housewarming', 'housewarming', 'Housewarming and griha pravesh'),
  ('Graduation', 'graduation', 'Graduation and convocation celebrations'),
  ('Religious Ceremony', 'religious-ceremony', 'Pujas, prayers and other religious functions'),
  ('Corporate Event', 'corporate-event', 'Company meetups, offsites and celebrations'),
  ('Conference', 'conference', 'Conferences, seminars and summits'),
  ('Product Launch', 'product-launch', 'Product and brand launches'),
  ('Concert', 'concert', 'Concerts and live music shows'),
  ('Festival', 'festival', 'Festivals and cultural celebrations'),
  ('Other', 'other', 'Any other kind of event')
ON CONFLICT ("slug") DO NOTHING;
