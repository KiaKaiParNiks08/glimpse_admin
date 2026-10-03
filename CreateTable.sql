-- UUID generation: use gen_random_uuid() (PostgreSQL 13+ built-in, no extension)
-- Idempotent: create types only if they don't exist (single-click re-runnable)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'post_status') THEN
    CREATE TYPE post_status AS ENUM ('active', 'deleted');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'media_type') THEN
    CREATE TYPE media_type AS ENUM ('image', 'video');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'comment_status') THEN
    CREATE TYPE comment_status AS ENUM ('active', 'deleted');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'page_status') THEN
    CREATE TYPE page_status AS ENUM ('draft', 'published');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
    CREATE TYPE notification_type AS ENUM (
      'post_like', 'post_comment', 'event_invite', 'event_update', 'event_reminder', 'general'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS roles (
  id serial not null,
  name character varying(50) not null,
  description text null,
  created_at timestamp without time zone null default CURRENT_TIMESTAMP,
  constraint roles_pkey primary key (id),
  constraint roles_name_key unique (name)
) TABLESPACE pg_default;

CREATE TABLE IF NOT EXISTS users (
  id uuid not null default gen_random_uuid (),
  full_name character varying(100) not null,
  country_code character varying(100) null,
  email character varying(150) not null,
  password_hash text not null,
  role_id integer not null,
  avatar_url text null,
  instagram_id text null,
  mobile_number character varying(20) null,
  is_active boolean null default true,
  created_at timestamp without time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp without time zone null default CURRENT_TIMESTAMP,
  constraint users_pkey primary key (id),
  constraint users_email_key unique (email),
  constraint users_role_id_fkey foreign KEY (role_id) references roles (id) on delete RESTRICT
) TABLESPACE pg_default;



-- Create event_categories table
CREATE TABLE IF NOT EXISTS event_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(100) NOT NULL,
    slug VARCHAR(120) NOT NULL UNIQUE,

    description TEXT NULL,

    icon_url TEXT NULL,         -- for app category icon
    banner_url TEXT NULL,       -- optional category banner image

    is_active BOOLEAN DEFAULT TRUE,

    created_by UUID NULL,       -- super admin who created it

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Foreign Key (optional)
    CONSTRAINT fk_event_category_created_by
        FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON DELETE SET NULL
);

INSERT INTO event_categories (name, slug)
VALUES
('Wedding', 'wedding'),
('Birthday Party', 'birthday-party'),
('Corporate Event', 'corporate-event'),
('Engagement', 'engagement'),
('Baby Shower', 'baby-shower')
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS user_otps (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  otp character varying(6) not null,
  expires_at timestamp with time zone not null,
  is_verified boolean null default false,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint user_otps_pkey primary key (id),
  constraint fk_user_otp_user foreign KEY (user_id) references users (id) on delete CASCADE
) TABLESPACE pg_default;

CREATE TABLE IF NOT EXISTS venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  description TEXT,
  bg_image_url TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  city VARCHAR(100),
  state_name VARCHAR(100),
  country VARCHAR(100),
  postal_code VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create venue_facilities table
CREATE TABLE IF NOT EXISTS venue_facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create venue_contacts table (SPOC - Single Point of Contact)
CREATE TABLE IF NOT EXISTS venue_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  image_url TEXT,
  phone_number VARCHAR(20),
  email VARCHAR(255),
  role VARCHAR(255) NULL,
  is_primary boolean,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create venue_photos table
CREATE TABLE IF NOT EXISTS venue_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  alt_text VARCHAR(255),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sub-venues: named areas under a main venue (title + description only)
CREATE TABLE IF NOT EXISTS venue_subvenues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ(6) DEFAULT now()
);

-- App themes (must exist before events.app_theme_id FK)
CREATE TABLE IF NOT EXISTS app_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  primary_color VARCHAR(20) NOT NULL,
  secondary_color VARCHAR(20) NOT NULL,
  button_primary_color VARCHAR(20) NOT NULL,
  button_secondary_color VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ(6) DEFAULT now(),
  updated_at TIMESTAMPTZ(6) DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_themes_name ON app_themes(name);

CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    category_id UUID NOT NULL,

    title VARCHAR(200) NOT NULL,
    slug VARCHAR(220) NOT NULL UNIQUE,

    event_code VARCHAR(20) NOT NULL UNIQUE,

    description TEXT NULL,
    e_invite_pdf_url TEXT NULL,
    groom_name VARCHAR(200) NULL,
    bride_name VARCHAR(200) NULL,
    greetings_text TEXT NULL,
    theme VARCHAR(150) NULL,
    app_theme_id UUID NULL,
    cover_image TEXT NULL,

    start_date DATE NOT NULL,
    end_date DATE NOT NULL,

    -- Reference to main/default venue (optional)
    main_venue_id UUID NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'completed', 'cancelled')),

    created_by UUID NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Foreign Keys
    CONSTRAINT fk_event_category
        FOREIGN KEY (category_id)
        REFERENCES event_categories(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_event_created_by
        FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_event_main_venue
        FOREIGN KEY (main_venue_id)
        REFERENCES venues(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_event_app_theme
        FOREIGN KEY (app_theme_id)
        REFERENCES app_themes(id)
        ON DELETE SET NULL,

    -- Ensure end_date is not before start_date
    CONSTRAINT chk_event_dates
        CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS event_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    event_id UUID NOT NULL,
    user_id UUID NOT NULL,

    assigned_by UUID NULL, -- who assigned this admin (usually super admin)

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Foreign Keys
    CONSTRAINT fk_event_admin_event
        FOREIGN KEY (event_id)
        REFERENCES events(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_event_admin_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_event_admin_assigned_by
        FOREIGN KEY (assigned_by)
        REFERENCES users(id)
        ON DELETE SET NULL,

    -- Prevent duplicate admin assignment
    CONSTRAINT unique_event_admin UNIQUE (event_id, user_id)
);

-- Create admin_events junction table
CREATE TABLE IF NOT EXISTS events_admin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, event_id)
);

CREATE TABLE IF NOT EXISTS event_days (
  id uuid not null default gen_random_uuid (),
  event_id uuid not null,
  title character varying(100) null,
  date date not null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint event_days_pkey primary key (id),
  constraint event_days_event_date_key unique (event_id, date),
  constraint fk_event_day_event foreign KEY (event_id) references events (id) on delete CASCADE
) TABLESPACE pg_default;

CREATE TABLE IF NOT EXISTS posts (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  caption text null,
  status post_status null default 'active'::post_status,
  like_count integer null default 0,
  comment_count integer null default 0,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint posts_pkey primary key (id),
  constraint posts_user_id_fkey foreign KEY (user_id) references users (id) on delete CASCADE
) TABLESPACE pg_default;

CREATE TABLE IF NOT EXISTS post_media (
  id uuid not null default gen_random_uuid(),
  post_id uuid not null,
  media_type media_type not null,
  media_url text not null,
  thumbnail_url text null,
  media_order integer null default 1,
  metadata jsonb null,
  created_at timestamp with time zone null default now(),
  constraint post_media_pkey primary key (id),
  constraint post_media_post_id_fkey foreign KEY (post_id) references posts (id) on delete CASCADE
) TABLESPACE pg_default;

CREATE TABLE IF NOT EXISTS post_likes (
  id uuid not null default gen_random_uuid(),
  post_id uuid not null,
  user_id uuid not null,
  created_at timestamp with time zone null default now(),
  constraint post_likes_pkey primary key (id),
  constraint post_likes_post_id_user_id_key unique (post_id, user_id),
  constraint post_likes_post_id_fkey foreign KEY (post_id) references posts (id) on delete CASCADE,
  constraint post_likes_user_id_fkey foreign KEY (user_id) references users (id) on delete CASCADE
) TABLESPACE pg_default;

CREATE TABLE IF NOT EXISTS notifications (
  id uuid not null default gen_random_uuid(),
  recipient_user_id uuid not null,
  sender_user_id uuid null,
  notification_type notification_type not null,
  reference_id uuid null,
  reference_type character varying(20) null,
  title character varying(255) null,
  message text null,
  is_read boolean null default false,
  is_deleted boolean null default false,
  created_at timestamp with time zone null default now(),
  constraint notifications_pkey primary key (id),
  constraint notifications_recipient_user_id_fkey foreign KEY (recipient_user_id) references users (id) on delete CASCADE,
  constraint notifications_sender_user_id_fkey foreign KEY (sender_user_id) references users (id) on delete set null,
  constraint notifications_reference_type_check check (
    (
      (reference_type)::text = any (
        (
          array[
            'post'::character varying,
            'event'::character varying
          ]
        )::text[]
      )
    )
  )
) TABLESPACE pg_default;

CREATE TABLE IF NOT EXISTS explore_categories (
  id uuid not null default gen_random_uuid (),
  title character varying(150) not null,
  description text null,
  background_url text null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint explore_categories_pkey primary key (id),
  constraint explore_categories_title_key unique (title)
) TABLESPACE pg_default;

CREATE TABLE IF NOT EXISTS event_sessions (
  id uuid not null default gen_random_uuid (),
  event_day_id uuid not null,
  title character varying(150) not null,
  description text null,
  start_time time without time zone null,
  end_time time without time zone null,
  venue_id uuid null,
  venue_subvenue_id uuid null,
  status character varying(20) null default 'upcoming'::character varying,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  event_session_bg_url text null,
  constraint event_sessions_pkey primary key (id),
  constraint event_sessions_day_title_key unique (event_day_id, title),
  constraint fk_session_day foreign KEY (event_day_id) references event_days (id) on delete CASCADE,
  constraint fk_session_venue foreign KEY (venue_id) references venues (id) on delete set null,
  constraint fk_session_venue_subvenue foreign KEY (venue_subvenue_id) references venue_subvenues (id) on delete set null,
  constraint event_sessions_status_check check (
    (
      (status)::text = any (
        (
          array[
            'upcoming'::character varying,
            'finished'::character varying,
            'cancelled'::character varying
          ]
        )::text[]
      )
    )
  )
) TABLESPACE pg_default;

CREATE TABLE IF NOT EXISTS event_organizers (
  id uuid not null default gen_random_uuid (),
  event_id uuid not null,
  name character varying(200) not null,
  logo_url text null,
  contact_email character varying(150) null,
  contact_phone character varying(50) null,
  website_url text null,
  created_by uuid null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint event_organizers_pkey primary key (id),
  constraint event_organizers_event_name_key unique (event_id, name),
  constraint fk_organizer_created_by foreign KEY (created_by) references users (id) on delete set null,
  constraint fk_organizer_event foreign KEY (event_id) references events (id) on delete CASCADE
) TABLESPACE pg_default;

CREATE TABLE IF NOT EXISTS event_offering_master (
  id uuid not null default gen_random_uuid (),
  title character varying(200) not null,
  description text null,
  created_by uuid null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint event_offering_master_pkey primary key (id),
  constraint event_offering_master_title_key unique (title),
  constraint fk_offering_master_created_by foreign KEY (created_by) references users (id) on delete set null
) TABLESPACE pg_default;

CREATE TABLE IF NOT EXISTS event_offerings (
  id uuid not null default gen_random_uuid (),
  event_id uuid not null,
  offering_master_id uuid not null,
  is_active boolean null default true,
  created_by uuid null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint event_offerings_pkey primary key (id),
  constraint event_offerings_event_master_key unique (event_id, offering_master_id),
  constraint fk_event_offering_created_by foreign KEY (created_by) references users (id) on delete set null,
  constraint fk_event_offering_event foreign KEY (event_id) references events (id) on delete CASCADE,
  constraint fk_event_offering_master foreign KEY (offering_master_id) references event_offering_master (id) on delete CASCADE
) TABLESPACE pg_default;

CREATE TABLE IF NOT EXISTS event_guests (
  id uuid not null default gen_random_uuid (),
  event_id uuid not null,
  user_id uuid not null,
  venue_contact_id uuid null,
  rsvp_status character varying(20) not null default 'pending'::character varying,
  wedding_side character varying(20) null,
  invited_by uuid null,
  joined_at timestamp with time zone null default CURRENT_TIMESTAMP,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint event_guests_pkey primary key (id),
  constraint unique_event_user unique (event_id, user_id),
  constraint fk_invited_by foreign KEY (invited_by) references users (id) on delete set null,
  constraint fk_user foreign KEY (user_id) references users (id) on delete CASCADE,
  constraint fk_venue_contact foreign KEY (venue_contact_id) references venue_contacts (id) on delete set null,
  constraint event_guests_rsvp_status_check check (
    (
      (rsvp_status)::text = any (
        (
          array[
            'pending'::character varying,
            'going'::character varying,
            'not_going'::character varying
          ]
        )::text[]
      )
    )
  )
) TABLESPACE pg_default;

CREATE TABLE IF NOT EXISTS explore_items (
  id uuid not null default gen_random_uuid (),
  category_id uuid not null,
  title character varying(200) not null,
  description text null,
  address character varying(300) null,
  city character varying(100) null,
  state character varying(100) null,
  country character varying(100) null,
  latitude numeric(10, 7) null,
  longitude numeric(10, 7) null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint explore_items_pkey primary key (id),
  constraint explore_items_category_title_key unique (category_id, title),
  constraint fk_explore_item_category foreign KEY (category_id) references explore_categories (id) on delete CASCADE
) TABLESPACE pg_default;

CREATE TABLE IF NOT EXISTS event_explore_items (
  id uuid not null default gen_random_uuid (),
  event_id uuid not null,
  explore_item_id uuid not null,
  is_active boolean null default true,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint event_explore_items_pkey primary key (id),
  constraint unique_event_explore unique (event_id, explore_item_id),
  constraint fk_event_explore_event foreign KEY (event_id) references events (id) on delete CASCADE,
  constraint fk_event_explore_item foreign KEY (explore_item_id) references explore_items (id) on delete CASCADE
) TABLESPACE pg_default;

CREATE TABLE IF NOT EXISTS event_day_media (
  id uuid not null default gen_random_uuid (),
  event_day_id uuid not null,
  media_url text not null,
  media_type character varying(10) not null,
  uploaded_by uuid null,
  display_order integer null default 0,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint event_day_media_pkey primary key (id),
  constraint fk_day_media_day foreign KEY (event_day_id) references event_days (id) on delete CASCADE,
  constraint fk_day_media_user foreign KEY (uploaded_by) references users (id) on delete set null,
  constraint event_day_media_media_type_check check (
    (
      (media_type)::text = any (
        (
          array[
            'image'::character varying,
            'video'::character varying
          ]
        )::text[]
      )
    )
  )
) TABLESPACE pg_default;

-- AlterTable
ALTER TABLE "event_day_media" ADD COLUMN IF NOT EXISTS "media_key" TEXT;

-- Optional index for key lookups / housekeeping
CREATE INDEX IF NOT EXISTS "idx_event_day_media_media_key" ON "event_day_media"("media_key");

CREATE TABLE IF NOT EXISTS comments (
  id uuid not null default gen_random_uuid(),
  post_id uuid not null,
  user_id uuid not null,
  parent_comment_id uuid null,
  comment_text text not null,
  status comment_status null default 'active'::comment_status,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint comments_pkey primary key (id),
  constraint comments_parent_comment_id_fkey foreign KEY (parent_comment_id) references comments (id) on delete CASCADE,
  constraint comments_post_id_fkey foreign KEY (post_id) references posts (id) on delete CASCADE,
  constraint comments_user_id_fkey foreign KEY (user_id) references users (id) on delete CASCADE
) TABLESPACE pg_default;

CREATE TABLE IF NOT EXISTS cms_pages (
  id uuid not null default gen_random_uuid(),
  slug character varying(100) not null,
  title character varying(200) not null,
  content text not null,
  status page_status null default 'draft'::page_status,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint cms_pages_pkey primary key (id),
  constraint cms_pages_slug_key unique (slug)
) TABLESPACE pg_default;

CREATE TABLE IF NOT EXISTS app_configurations (
  id uuid not null default gen_random_uuid(),
  platform character varying(20) not null,
  app_name character varying(150) null,
  store_url text not null,
  current_version character varying(20) null,
  minimum_supported_version character varying(20) null,
  force_update boolean null default false,
  is_active boolean null default true,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint app_configurations_pkey primary key (id),
  constraint app_configurations_platform_key unique (platform),
  constraint app_configurations_platform_check check (
    (
      (platform)::text = any (
        (
          array[
            'android'::character varying,
            'ios'::character varying
          ]
        )::text[]
      )
    )
  )
) TABLESPACE pg_default;

CREATE TABLE IF NOT EXISTS event_highlights (
  id uuid not null default gen_random_uuid (),
  event_id uuid not null,
  title character varying(200) not null,
  description text null,
  media_url text null,
  media_type character varying(10) null default 'image'::character varying,
  display_order integer null default 0,
  is_active boolean null default true,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint event_highlights_pkey primary key (id),
  constraint event_highlights_event_display_order_key unique (event_id, display_order),
  constraint fk_event_highlights_event foreign KEY (event_id) references events (id) on delete CASCADE,
  constraint event_highlights_media_type_check check (
    (
      (media_type)::text = any (
        (
          array[
            'image'::character varying,
            'gif'::character varying,
            'video'::character varying
          ]
        )::text[]
      )
    )
  )
) TABLESPACE pg_default;

-- Create current_happening table
CREATE TABLE IF NOT EXISTS current_happening (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  bg_image_url TEXT NOT NULL,
  happening_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  display_order INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
) TABLESPACE pg_default;

-- Create happening_photos table
CREATE TABLE IF NOT EXISTS happening_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  happening_id UUID NOT NULL REFERENCES current_happening(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  media_type VARCHAR(10) NOT NULL DEFAULT 'image',
  alt_text VARCHAR(255),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
) TABLESPACE pg_default;

-- Add media_type for existing databases created before video support
ALTER TABLE happening_photos ADD COLUMN IF NOT EXISTS media_type VARCHAR(10) NOT NULL DEFAULT 'image';

CREATE INDEX idx_current_happening_active_order 
ON current_happening (is_active, display_order, happening_date DESC);

CREATE INDEX idx_current_happening_event_id 
ON current_happening (event_id);

CREATE INDEX idx_happening_photos_happening_id 
ON happening_photos (happening_id, sort_order);

CREATE TYPE device_type AS ENUM ('android', 'ios', 'web');

CREATE TABLE user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  device_type device_type NOT NULL,
  device_id VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_seen_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_user_devices_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE NO ACTION
);

ALTER TABLE "events"
ADD COLUMN IF NOT EXISTS "post_event_pdf_url" TEXT,
ADD COLUMN IF NOT EXISTS "post_event_pdf_key" TEXT,
ADD COLUMN IF NOT EXISTS "post_event_pdf_original_name" VARCHAR(500),
ADD COLUMN IF NOT EXISTS "post_event_pdf_size" INTEGER,
ADD COLUMN IF NOT EXISTS "post_event_pdf_uploaded_by" UUID,
ADD COLUMN IF NOT EXISTS "post_event_pdf_uploaded_at" TIMESTAMPTZ(6);

ALTER TABLE "events"
ADD COLUMN IF NOT EXISTS "groom_name" VARCHAR(200),
ADD COLUMN IF NOT EXISTS "bride_name" VARCHAR(200),
ADD COLUMN IF NOT EXISTS "greetings_text" TEXT;

CREATE UNIQUE INDEX user_devices_user_id_device_id_key
  ON user_devices(user_id, device_id);

CREATE INDEX idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX idx_user_devices_device_type ON user_devices(device_type);

-- Ensure unique constraints exist (for re-run on DBs created before these were added)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_highlights_event_display_order_key') THEN
    ALTER TABLE event_highlights ADD CONSTRAINT event_highlights_event_display_order_key UNIQUE (event_id, display_order);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_organizers_event_name_key') THEN
    ALTER TABLE event_organizers ADD CONSTRAINT event_organizers_event_name_key UNIQUE (event_id, name);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_days_event_date_key') THEN
    ALTER TABLE event_days ADD CONSTRAINT event_days_event_date_key UNIQUE (event_id, date);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_sessions_day_title_key') THEN
    ALTER TABLE event_sessions ADD CONSTRAINT event_sessions_day_title_key UNIQUE (event_day_id, title);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_offerings_event_master_key') THEN
    ALTER TABLE event_offerings ADD CONSTRAINT event_offerings_event_master_key UNIQUE (event_id, offering_master_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'explore_items_category_title_key') THEN
    ALTER TABLE explore_items ADD CONSTRAINT explore_items_category_title_key UNIQUE (category_id, title);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_offering_master_title_key') THEN
    ALTER TABLE event_offering_master ADD CONSTRAINT event_offering_master_title_key UNIQUE (title);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'explore_categories_title_key') THEN
    ALTER TABLE explore_categories ADD CONSTRAINT explore_categories_title_key UNIQUE (title);
  END IF;
END $$;

-- event_sessions.venue_subvenue_id: optional sub-area under venue_id (parent venue)
ALTER TABLE event_sessions ADD COLUMN IF NOT EXISTS venue_subvenue_id UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_venue_subvenue') THEN
    ALTER TABLE event_sessions
      ADD CONSTRAINT fk_session_venue_subvenue
      FOREIGN KEY (venue_subvenue_id)
      REFERENCES venue_subvenues (id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- events.app_theme_id + FK for databases created before this column existed
ALTER TABLE events ADD COLUMN IF NOT EXISTS app_theme_id UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_event_app_theme') THEN
    ALTER TABLE events
      ADD CONSTRAINT fk_event_app_theme
      FOREIGN KEY (app_theme_id)
      REFERENCES app_themes(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Performance indexes (idempotent: IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_user_otps_user_id ON user_otps(user_id);
CREATE INDEX IF NOT EXISTS idx_event_categories_created_by ON event_categories(created_by);
CREATE INDEX IF NOT EXISTS idx_venues_city ON venues(city);
CREATE INDEX IF NOT EXISTS idx_venues_country ON venues(country);
CREATE INDEX IF NOT EXISTS idx_venue_facilities_venue_id ON venue_facilities(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_contacts_venue_id ON venue_contacts(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_photos_venue_id ON venue_photos(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_subvenues_venue_id ON venue_subvenues(venue_id);
CREATE INDEX IF NOT EXISTS idx_events_category_id ON events(category_id);
CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by);
CREATE INDEX IF NOT EXISTS idx_events_main_venue_id ON events(main_venue_id);
CREATE INDEX IF NOT EXISTS idx_events_app_theme_id ON events(app_theme_id);
CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_start_date ON events(start_date);
CREATE INDEX IF NOT EXISTS idx_event_admins_event_id ON event_admins(event_id);
CREATE INDEX IF NOT EXISTS idx_event_admins_user_id ON event_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_events_admin_user_id ON events_admin(user_id);
CREATE INDEX IF NOT EXISTS idx_events_admin_event_id ON events_admin(event_id);
CREATE INDEX IF NOT EXISTS idx_event_days_event_id ON event_days(event_id);
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);
CREATE INDEX IF NOT EXISTS idx_post_media_post_id ON post_media(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_user_id ON post_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_user_id ON notifications(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_event_sessions_event_day_id ON event_sessions(event_day_id);
CREATE INDEX IF NOT EXISTS idx_event_sessions_venue_id ON event_sessions(venue_id);
CREATE INDEX IF NOT EXISTS idx_event_sessions_venue_subvenue_id ON event_sessions(venue_subvenue_id);
CREATE INDEX IF NOT EXISTS idx_event_organizers_event_id ON event_organizers(event_id);
CREATE INDEX IF NOT EXISTS idx_event_offerings_event_id ON event_offerings(event_id);
CREATE INDEX IF NOT EXISTS idx_event_offerings_offering_master_id ON event_offerings(offering_master_id);
CREATE INDEX IF NOT EXISTS idx_event_guests_event_id ON event_guests(event_id);
CREATE INDEX IF NOT EXISTS idx_event_guests_user_id ON event_guests(user_id);
CREATE INDEX IF NOT EXISTS idx_explore_items_category_id ON explore_items(category_id);
CREATE INDEX IF NOT EXISTS idx_event_explore_items_event_id ON event_explore_items(event_id);
CREATE INDEX IF NOT EXISTS idx_event_day_media_event_day_id ON event_day_media(event_day_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_event_highlights_event_id ON event_highlights(event_id);

-- Seed: event_offering_master (must run before event_offerings)
INSERT INTO event_offering_master (title, description)
VALUES
('Fun', 'Games, entertainment, and interactive activities'),
('Food & Cocktails', 'Variety of food stalls and drinks'),
('Live Music', 'Live performances, bands, and DJs'),
('Food Truck', 'Mobile food trucks offering snacks and meals'),
('Cake Cutting', 'Special cake cutting ceremony'),
('Toasts & Speeches', 'Formal toasts, speeches, and announcements')
ON CONFLICT (title) DO NOTHING;

-- Seed: venues (idempotent; required for venue_contacts and venue_photos below)
INSERT INTO venues (name, address, description, bg_image_url, latitude, longitude, city, state_name, country, postal_code)
SELECT 'Sunset Beach Resort', '123 Ocean Drive, Juhu Beach', 'A beautiful beachside venue perfect for weddings and sunset events.', 'https://cdn.yourapp.com/venues/sunset-beach.jpg', 19.10756700, 72.82631400, 'Mumbai', 'Maharashtra', 'India', '400049'
WHERE NOT EXISTS (SELECT 1 FROM venues WHERE name = 'Sunset Beach Resort' AND city = 'Mumbai');
INSERT INTO venues (name, address, description, bg_image_url, latitude, longitude, city, state_name, country, postal_code)
SELECT 'Royal Palace Banquet', '45 MG Road, Andheri East', 'Luxury indoor banquet hall suitable for large gatherings and corporate events.', 'https://cdn.yourapp.com/venues/royal-palace.jpg', 19.11967700, 72.84684100, 'Mumbai', 'Maharashtra', 'India', '400069'
WHERE NOT EXISTS (SELECT 1 FROM venues WHERE name = 'Royal Palace Banquet' AND city = 'Mumbai');
INSERT INTO venues (name, address, description, bg_image_url, latitude, longitude, city, state_name, country, postal_code)
SELECT 'Green Valley Lawn', 'Near Express Highway, Goregaon', 'Spacious open lawn venue surrounded by greenery.', 'https://cdn.yourapp.com/venues/green-valley.jpg', 19.15514500, 72.84933400, 'Mumbai', 'Maharashtra', 'India', '400063'
WHERE NOT EXISTS (SELECT 1 FROM venues WHERE name = 'Green Valley Lawn' AND city = 'Mumbai');
INSERT INTO venues (name, address, description, bg_image_url, latitude, longitude, city, state_name, country, postal_code)
SELECT 'Skyline Rooftop Lounge', 'Tower B, Bandra Kurla Complex', 'Premium rooftop venue with city skyline view.', 'https://cdn.yourapp.com/venues/skyline-rooftop.jpg', 19.06069100, 72.86561400, 'Mumbai', 'Maharashtra', 'India', '400051'
WHERE NOT EXISTS (SELECT 1 FROM venues WHERE name = 'Skyline Rooftop Lounge' AND city = 'Mumbai');
INSERT INTO venues (name, address, description, bg_image_url, latitude, longitude, city, state_name, country, postal_code)
SELECT 'Heritage Garden', 'Civil Lines Road', 'Traditional heritage venue ideal for cultural and family events.', 'https://cdn.yourapp.com/venues/heritage-garden.jpg', 28.70406000, 77.10249300, 'Delhi', 'Delhi', 'India', '110054'
WHERE NOT EXISTS (SELECT 1 FROM venues WHERE name = 'Heritage Garden' AND city = 'Delhi');

  INSERT INTO cms_pages (
    slug,
    title,
    content,
    status
)
VALUES (
    'privacy-policy',
    'Privacy Policy',
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Proin metus eros, tempus ac placerat sit amet, pulvinar sit amet arcu. Proin diam ipsum, aliquam et quam sed, euismod placerat metus. Nulla varius quam at rutrum lobortis.

Morbi pulvinar hendrerit augue non pulvinar. Praesent ullamcorper cursus pharetra. Sed faucibus eleifend pharetra. Nullam viverra lorem ligula, non commodo diam convallis ac.

Sed maximus interdum odio. Sed sagittis maximus dapibus. Sed porta molestie viverra. Maecenas quis nisl convallis, semper est quis, aliquam nunc.

Aliquam sit amet ipsum turpis. Sed quis odio vel leo tincidunt sodales blandit nec metus. Maecenas suscipit lectus tellus, at mattis neque laoreet ac.

In porta augue id tellus consectetur finibus. Nulla lorem felis, efficitur ut lorem at, varius porta velit. Fusce gravida vehicula faucibus.',
    'published'
);

INSERT INTO cms_pages (
    slug,
    title,
    content,
    status
)
VALUES (
    'about',
    'About App',
    'Welcome to Glimpse! Version 1.0

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Proin metus eros, tempus ac placerat sit amet, pulvinar sit amet arcu. Proin diam ipsum, aliquam et quam sed, euismod placerat metus. Nulla varius quam at rutrum lobortis. Morbi pulvinar hendrerit augue non pulvinar. Praesent ullamcorper cursus pharetra. Sed faucibus eleifend pharetra.

Sed maximus interdum odio. Sed sagittis maximus dapibus. Sed porta molestie viverra. Maecenas quis nisl convallis, semper est quis, aliquam nunc. In et tempor urna. Nulla vel tempus nunc, at varius magna.

Aliquam sit amet ipsum turpis. Sed quis odio vel leo tincidunt sodales blandit nec metus. Maecenas suscipit lectus tellus, at mattis neque laoreet ac. Aliquam molestie tellus vel ullamcorper faucibus.

In porta augue id tellus consectetur finibus. Nulla lorem felis, efficitur ut lorem at, varius porta velit. Fusce gravida vehicula faucibus.',
    'published'
);

INSERT INTO app_configurations (
    platform,
    app_name,
    store_url,
    current_version,
    minimum_supported_version,
    force_update
)
VALUES (
    'android',
    'My Social App',
    'https://play.google.com/store/apps/details?id=com.mysocial.app',
    '2.0.0',
    '1.5.0',
    true
);

INSERT INTO app_configurations (
    platform,
    app_name,
    store_url,
    current_version,
    minimum_supported_version,
    force_update
)
VALUES (
    'ios',
    'My Social App',
    'https://apps.apple.com/app/id123456789',
    '2.0.0',
    '1.4.0',
    false
);


INSERT INTO venues (
    name,
    address,
    description,
    bg_image_url,
    latitude,
    longitude,
    city,
    state_name,
    country,
    postal_code
)
VALUES
(
    'Sunset Beach Resort',
    '123 Ocean Drive, Juhu Beach',
    'A beautiful beachside venue perfect for weddings and sunset events.',
    'https://cdn.yourapp.com/venues/sunset-beach.jpg',
    19.10756700,
    72.82631400,
    'Mumbai',
    'Maharashtra',
    'India',
    '400049'
),
(
    'Royal Palace Banquet',
    '45 MG Road, Andheri East',
    'Luxury indoor banquet hall suitable for large gatherings and corporate events.',
    'https://cdn.yourapp.com/venues/royal-palace.jpg',
    19.11967700,
    72.84684100,
    'Mumbai',
    'Maharashtra',
    'India',
    '400069'
),
(
    'Green Valley Lawn',
    'Near Express Highway, Goregaon',
    'Spacious open lawn venue surrounded by greenery.',
    'https://cdn.yourapp.com/venues/green-valley.jpg',
    19.15514500,
    72.84933400,
    'Mumbai',
    'Maharashtra',
    'India',
    '400063'
),
(
    'Skyline Rooftop Lounge',
    'Tower B, Bandra Kurla Complex',
    'Premium rooftop venue with city skyline view.',
    'https://cdn.yourapp.com/venues/skyline-rooftop.jpg',
    19.06069100,
    72.86561400,
    'Mumbai',
    'Maharashtra',
    'India',
    '400051'
),
(
    'Heritage Garden',
    'Civil Lines Road',
    'Traditional heritage venue ideal for cultural and family events.',
    'https://cdn.yourapp.com/venues/heritage-garden.jpg',
    28.70406000,
    77.10249300,
    'Delhi',
    'Delhi',
    'India',
    '110054'
);

INSERT INTO venue_contacts (venue_id, name, image_url, phone_number, email, role, is_primary)
SELECT v.id, c.name, c.image_url, c.phone_number, c.email, c.role, c.is_primary
FROM venues v
JOIN (VALUES
  ('Rahul Sharma','https://cdn.yourapp.com/venues/contacts/rahul.jpg','+91-9876543210','rahul@sunsetvenue.com','Venue Manager',true),
  ('Priya Mehta','https://cdn.yourapp.com/venues/contacts/priya.jpg','+91-9823456789','priya@sunsetvenue.com','Event Coordinator',false),
  ('Amit Verma','https://cdn.yourapp.com/venues/contacts/amit.jpg','+91-9811122233','amit@sunsetvenue.com','Sales Executive',false)
) AS c(name,image_url,phone_number,email,role,is_primary) ON true
WHERE v.name = 'Heritage Garden'
  AND NOT EXISTS (SELECT 1 FROM venue_contacts vc WHERE vc.venue_id = v.id AND vc.name = c.name);

INSERT INTO roles (id, name, description)
VALUES
(1, 'super_admin', 'Full Access'),
(2, 'event_admin', 'Event level access'),
(3, 'user', 'application level')
ON CONFLICT (name) DO NOTHING;

INSERT INTO users (full_name, email, password_hash, role_id, is_active, avatar_url)
VALUES
('Admin User', 'admin@example.com', '$2b$10$examplehashedpasswordadmin', 1, true, 'https://cdn.yourapp.com/avatars/admin.jpg'),
('Rahul Mehta', 'organizer@example.com', '$2b$10$examplehashedpasswordorganizer', 2, true, 'https://cdn.yourapp.com/avatars/organizer.jpg'),
('Sneha Patel', 'user@example.com', '$2b$10$examplehashedpassworduser', 3, true, 'https://cdn.yourapp.com/avatars/user.jpg')
ON CONFLICT (email) DO NOTHING;

INSERT INTO venue_photos (venue_id, image_url, alt_text, sort_order)
SELECT v.id, p.image_url, p.alt_text, p.sort_order
FROM venues v
JOIN (VALUES
  ('https://cdn.yourapp.com/venues/photos/photo1.jpg','Main Entrance View',1),
  ('https://cdn.yourapp.com/venues/photos/photo2.jpg','Banquet Hall Interior',2),
  ('https://cdn.yourapp.com/venues/photos/photo3.jpg','Outdoor Lawn Area',3),
  ('https://cdn.yourapp.com/venues/photos/photo4.jpg','Stage Decoration Setup',4),
  ('https://cdn.yourapp.com/venues/photos/photo5.jpg','Evening Lighting View',5)
) AS p(image_url, alt_text, sort_order) ON true
WHERE v.name = 'Heritage Garden'
  AND NOT EXISTS (SELECT 1 FROM venue_photos vp WHERE vp.venue_id = v.id AND vp.image_url = p.image_url);


INSERT INTO events
(
    category_id,
    title,
    slug,
    event_code,
    description,
    theme,
    cover_image,
    start_date,
    end_date,
    main_venue_id,
    status,
    created_by,
    created_at,
    updated_at
)
VALUES
(
    (SELECT ec.id FROM event_categories ec WHERE slug = 'birthday-party' LIMIT 1),
    'Aarav 5th Birthday Party',
    'aarav-5th-birthday-2026',
    'EVT1003',
    'Fun-filled birthday celebration with games and entertainment.',
    'Cartoon Theme',
    'https://cdn.yourapp.com/events/birthday-cover.jpg',
    '2025-12-18',
    '2025-12-18',
    (SELECT id FROM venues WHERE name = 'Heritage Garden' LIMIT 1),
    'completed',
    (SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1),
    '2026-02-26 08:15:42.270764+00',
    '2026-02-26 08:15:42.270764+00'
),

(
    (SELECT ec.id FROM event_categories ec WHERE slug = 'wedding' LIMIT 1),
    'Rahul & Sneha Wedding',
    'rahul-sneha-wedding-2026',
    'EVT1001',
    'A grand wedding celebration with family and friends.',
    'Royal Traditional',
    'https://cdn.yourapp.com/events/wedding-cover.jpg',
    '2026-03-10',
    '2026-03-12',
    (SELECT id FROM venues WHERE name = 'Heritage Garden' LIMIT 1),
    'published',
    (SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1),
    '2026-02-26 08:15:42.270764+00',
    '2026-02-26 08:15:42.270764+00'
),

(
    (SELECT ec.id FROM event_categories ec WHERE slug = 'corporate-event' LIMIT 1),
    'Tech Innovators Summit 2026',
    'tech-innovators-summit-2026',
    'EVT1002',
    'Annual corporate technology summit featuring keynote speakers and networking.',
    'Modern Corporate',
    'https://cdn.yourapp.com/events/corporate-cover.jpg',
    '2026-04-05',
    '2026-04-06',
    (SELECT id FROM venues WHERE name = 'Heritage Garden' LIMIT 1),
    'draft',
    (SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1),
    '2026-02-26 08:15:42.270764+00',
    '2026-02-26 08:15:42.270764+00'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO event_highlights (
    event_id,
    title,
    description,
    media_url,
    media_type,
    display_order,
    is_active
)
VALUES

(
    (SELECT id FROM events WHERE slug = 'rahul-sneha-wedding-2026' LIMIT 1),
    'Grand Entry',
    'The couple made a royal grand entry with fireworks and music.',
    'https://cdn.yourapp.com/events/highlights/grand-entry.jpg',
    'image',
    1,
    true
),

(
    (SELECT id FROM events WHERE slug = 'rahul-sneha-wedding-2026' LIMIT 1),
    'First Dance Performance',
    'Romantic first dance performance that mesmerized everyone.',
    'https://cdn.yourapp.com/events/highlights/first-dance.mp4',
    'video',
    2,
    true
),

(
    (SELECT id FROM events WHERE slug = 'rahul-sneha-wedding-2026' LIMIT 1),
    'Fun Moments',
    'Guests enjoying fun dance moments.',
    'https://cdn.yourapp.com/events/highlights/fun-moment.gif',
    'gif',
    3,
    true
),

(
    (SELECT id FROM events WHERE slug = 'rahul-sneha-wedding-2026' LIMIT 1),
    'Stage Decoration',
    'Beautifully decorated stage setup.',
    'https://cdn.yourapp.com/events/highlights/stage-decor.jpg',
    'image',
    4,
    true
),

(
    (SELECT id FROM events WHERE slug = 'rahul-sneha-wedding-2026' LIMIT 1),
    'Behind The Scenes',
    'Preparation moments before the event started.',
    'https://cdn.yourapp.com/events/highlights/behind-scenes.jpg',
    'image',
    5,
    false
)
ON CONFLICT (event_id, display_order) DO NOTHING;

INSERT INTO explore_categories (title, description)
VALUES
('Shopping', 'Best places for shopping and retail therapy'),
('Taste', 'Famous food spots and must-try restaurants'),
('Must See', 'Iconic attractions and sightseeing places')
ON CONFLICT (title) DO NOTHING;

INSERT INTO explore_items (
    category_id,
    title,
    description,
    address,
    city,
    state,
    country,
    latitude,
    longitude
)
VALUES

-- 🛍 SHOPPING
(
    (SELECT id FROM explore_categories WHERE title = 'Shopping' LIMIT 1),
    'Phoenix Marketcity',
    'Premium shopping and entertainment destination.',
    'LBS Marg, Kurla West',
    'Mumbai',
    'Maharashtra',
    'India',
    19.0860000,
    72.8890000
),
(
    (SELECT id FROM explore_categories WHERE title = 'Shopping' LIMIT 1),
    'Colaba Causeway Market',
    'Famous street shopping market for fashion and souvenirs.',
    'Colaba Causeway',
    'Mumbai',
    'Maharashtra',
    'India',
    18.9235000,
    72.8312000
),

-- 🍴 TASTE
(
    (SELECT id FROM explore_categories WHERE title = 'Taste' LIMIT 1),
    'Bademiya Kebabs',
    'Iconic late-night kebab destination.',
    'Tulsiwadi, Colaba',
    'Mumbai',
    'Maharashtra',
    'India',
    18.9228000,
    72.8325000
),
(
    (SELECT id FROM explore_categories WHERE title = 'Taste' LIMIT 1),
    'Leopold Cafe',
    'Historic cafe serving multi-cuisine dishes.',
    'Colaba Causeway',
    'Mumbai',
    'Maharashtra',
    'India',
    18.9220000,
    72.8330000
),

-- 👀 MUST SEE
(
    (SELECT id FROM explore_categories WHERE title = 'Must See' LIMIT 1),
    'Gateway of India',
    'Historic monument overlooking the Arabian Sea.',
    'Apollo Bandar, Colaba',
    'Mumbai',
    'Maharashtra',
    'India',
    18.9220000,
    72.8347000
),
(
    (SELECT id FROM explore_categories WHERE title = 'Must See' LIMIT 1),
    'Juhu Beach',
    'Popular beach known for sunset views.',
    'Juhu Tara Road',
    'Mumbai',
    'Maharashtra',
    'India',
    19.1075000,
    72.8263000
)
ON CONFLICT (category_id, title) DO NOTHING;

INSERT INTO event_organizers (
    event_id,
    name,
    logo_url,
    contact_email,
    contact_phone,
    website_url,
    created_by
)
VALUES

(
    (SELECT id FROM events WHERE slug = 'rahul-sneha-wedding-2026' LIMIT 1),
    'Taste Masters Pvt Ltd',
    'https://example.com/logos/taste-masters.png',
    'contact@tastemasters.com',
    '+91-9876543210',
    'https://tastemasters.com',
    (SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1)
),

(
    (SELECT id FROM events WHERE slug = 'tech-innovators-summit-2026' LIMIT 1),
    'Innovate India Foundation',
    'https://example.com/logos/innovate-india.png',
    'info@innovateindia.org',
    '+91-9123456780',
    'https://innovateindia.org',
    (SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1)
),

(
    (SELECT id FROM events WHERE slug = 'aarav-5th-birthday-2026' LIMIT 1),
    'StarWave Entertainment',
    'https://example.com/logos/starwave.png',
    'hello@starwave.in',
    '+91-9988776655',
    'https://starwave.in',
    (SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1)
)
ON CONFLICT (event_id, name) DO NOTHING;

INSERT INTO event_days (
    event_id,
    title,
    date
)
VALUES

(
    (SELECT id FROM events WHERE slug = 'rahul-sneha-wedding-2026' LIMIT 1),
    'Mehendi Ceremony',
    '2026-03-10'
),

(
    (SELECT id FROM events WHERE slug = 'rahul-sneha-wedding-2026' LIMIT 1),
    'Haldi Ceremony',
    '2026-03-11'
),

(
    (SELECT id FROM events WHERE slug = 'rahul-sneha-wedding-2026' LIMIT 1),
    'Wedding & Reception',
    '2026-03-12'
)
ON CONFLICT (event_id, date) DO NOTHING;

INSERT INTO event_sessions (
    event_day_id,
    title,
    description,
    start_time,
    end_time,
    venue_id,
    status
)
VALUES

(
    (SELECT id FROM event_days WHERE title = 'Mehendi Ceremony' 
     AND event_id = (SELECT id FROM events WHERE slug='rahul-sneha-wedding-2026') LIMIT 1),
    'Mehendi Ceremony',
    'Traditional mehendi ritual with close family.',
    '10:00',
    '13:00',
    (SELECT id FROM venues WHERE name='Heritage Garden' LIMIT 1),
    'upcoming'
),

(
    (SELECT id FROM event_days WHERE title = 'Mehendi Ceremony'
     AND event_id = (SELECT id FROM events WHERE slug='rahul-sneha-wedding-2026') LIMIT 1),
    'Sangeet Night',
    'Dance performances and live DJ.',
    '19:00',
    '23:30',
    (SELECT id FROM venues WHERE name='Heritage Garden' LIMIT 1),
    'upcoming'
),

(
    (SELECT id FROM event_days WHERE title = 'Wedding & Reception'
     AND event_id = (SELECT id FROM events WHERE slug='rahul-sneha-wedding-2026') LIMIT 1),
    'Baraat Ceremony',
    'Groom’s grand entry with music and dance.',
    '16:00',
    '17:30',
    (SELECT id FROM venues WHERE name='Heritage Garden' LIMIT 1),
    'upcoming'
),

(
    (SELECT id FROM event_days WHERE title = 'Wedding & Reception'
     AND event_id = (SELECT id FROM events WHERE slug='rahul-sneha-wedding-2026') LIMIT 1),
    'Wedding Rituals',
    'Main wedding ceremony rituals.',
    '18:00',
    '20:30',
    (SELECT id FROM venues WHERE name='Heritage Garden' LIMIT 1),
    'upcoming'
),

(
    (SELECT id FROM event_days WHERE title = 'Wedding & Reception'
     AND event_id = (SELECT id FROM events WHERE slug='rahul-sneha-wedding-2026') LIMIT 1),
    'Reception Dinner',
    'Dinner and celebration with guests.',
    '21:00',
    '23:59',
    (SELECT id FROM venues WHERE name='Heritage Garden' LIMIT 1),
    'upcoming'
)
ON CONFLICT (event_day_id, title) DO NOTHING;

INSERT INTO event_offerings (
    event_id,
    offering_master_id,
    is_active,
    created_by
)
VALUES

(
    (SELECT id FROM events WHERE slug = 'rahul-sneha-wedding-2026' LIMIT 1),
    (SELECT id FROM event_offering_master WHERE title = 'Food & Cocktails' LIMIT 1),
    true,
    (SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1)
),

(
    (SELECT id FROM events WHERE slug = 'rahul-sneha-wedding-2026' LIMIT 1),
    (SELECT id FROM event_offering_master WHERE title = 'Live Music' LIMIT 1),
    true,
    (SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1)
),

(
    (SELECT id FROM events WHERE slug = 'rahul-sneha-wedding-2026' LIMIT 1),
    (SELECT id FROM event_offering_master WHERE title = 'Fun' LIMIT 1),
    true,
    (SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1)
),

(
    (SELECT id FROM events WHERE slug = 'rahul-sneha-wedding-2026' LIMIT 1),
    (SELECT id FROM event_offering_master WHERE title = 'Toasts & Speeches' LIMIT 1),
    true,
    (SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1)
)
ON CONFLICT (event_id, offering_master_id) DO NOTHING;