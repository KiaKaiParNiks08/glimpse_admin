-- Add text_color and body_text_color to app_themes
ALTER TABLE "app_themes"
  ADD COLUMN IF NOT EXISTS "text_color" VARCHAR(20) DEFAULT '#FFFFFF',
  ADD COLUMN IF NOT EXISTS "body_text_color" VARCHAR(20) DEFAULT '#CBD5E1';

UPDATE "app_themes" SET "text_color" = '#FFFFFF' WHERE "text_color" IS NULL;
UPDATE "app_themes" SET "body_text_color" = '#CBD5E1' WHERE "body_text_color" IS NULL;
