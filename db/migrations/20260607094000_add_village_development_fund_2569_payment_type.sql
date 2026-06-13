-- Add the special 2026 village development fund as an allowed maintenance-fee period/payment type.
-- UAT-first: allows Revenue filter, Record Payment, and Add Maintenance Fee to submit this value.

ALTER TABLE slip_processing.maintenance_fees
  DROP CONSTRAINT IF EXISTS maintenance_fees_frequency_chk;

ALTER TABLE slip_processing.maintenance_fees
  ADD CONSTRAINT maintenance_fees_frequency_chk
  CHECK ((payment_frequency)::text = ANY ((ARRAY[
    'monthly'::character varying,
    '3_months'::character varying,
    '6_months'::character varying,
    'yearly'::character varying,
    'village_fund_2569'::character varying
  ])::text[]));

ALTER TABLE slip_processing.payments
  DROP CONSTRAINT IF EXISTS payments_type_chk;

ALTER TABLE slip_processing.payments
  ADD CONSTRAINT payments_type_chk
  CHECK ((payment_type)::text = ANY ((ARRAY[
    'monthly'::character varying,
    '3_months'::character varying,
    '6_months'::character varying,
    'yearly'::character varying,
    'village_fund_2569'::character varying
  ])::text[]));
