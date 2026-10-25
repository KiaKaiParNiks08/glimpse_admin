-- Display size of each feed file. Null on posts created before this column existed.
ALTER TABLE post_media ADD COLUMN IF NOT EXISTS media_width INTEGER;
ALTER TABLE post_media ADD COLUMN IF NOT EXISTS media_height INTEGER;
ALTER TABLE post_media ADD COLUMN IF NOT EXISTS aspect_ratio DOUBLE PRECISION;
ALTER TABLE post_media ADD COLUMN IF NOT EXISTS thumbnail_width INTEGER;
ALTER TABLE post_media ADD COLUMN IF NOT EXISTS thumbnail_height INTEGER;
