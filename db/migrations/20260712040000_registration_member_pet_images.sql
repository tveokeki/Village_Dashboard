BEGIN;

ALTER TABLE slip_processing.household_members
  ADD COLUMN IF NOT EXISTS image_path TEXT,
  ADD COLUMN IF NOT EXISTS image_name TEXT,
  ADD COLUMN IF NOT EXISTS image_size_bytes INTEGER,
  ADD COLUMN IF NOT EXISTS image_mime_type TEXT;

ALTER TABLE slip_processing.household_pets
  ADD COLUMN IF NOT EXISTS image_path TEXT,
  ADD COLUMN IF NOT EXISTS image_name TEXT,
  ADD COLUMN IF NOT EXISTS image_size_bytes INTEGER,
  ADD COLUMN IF NOT EXISTS image_mime_type TEXT;

COMMIT;
