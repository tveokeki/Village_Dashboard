-- Resident self-service registration for household members and pets
-- UAT-first additive migration. Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS slip_processing.household_members (
  id UUID PRIMARY KEY,
  web_user_id UUID NOT NULL REFERENCES slip_processing.web_users(id) ON DELETE CASCADE,
  house_number TEXT,
  full_name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  age INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT household_members_age_check CHECK (age IS NULL OR (age >= 0 AND age <= 120))
);

CREATE INDEX IF NOT EXISTS idx_household_members_web_user_active
  ON slip_processing.household_members(web_user_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS slip_processing.household_pets (
  id UUID PRIMARY KEY,
  web_user_id UUID NOT NULL REFERENCES slip_processing.web_users(id) ON DELETE CASCADE,
  house_number TEXT,
  pet_name TEXT NOT NULL,
  pet_type TEXT NOT NULL,
  distinctive_features TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_household_pets_web_user_active
  ON slip_processing.household_pets(web_user_id)
  WHERE deleted_at IS NULL;
