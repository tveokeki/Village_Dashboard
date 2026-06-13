-- UAT-first: remove 3-month, 6-month, and yearly revenue payment/frequency options.
-- Keep only monthly common fees and the 2026 village development fund.

ALTER TABLE slip_processing.maintenance_fees
  DROP CONSTRAINT IF EXISTS maintenance_fees_frequency_chk;

ALTER TABLE slip_processing.maintenance_fees
  ADD CONSTRAINT maintenance_fees_frequency_chk CHECK (((payment_frequency)::text = ANY (ARRAY[
    'monthly'::character varying,
    'village_fund_2569'::character varying
  ]::text[])));

ALTER TABLE slip_processing.payments
  DROP CONSTRAINT IF EXISTS payments_type_chk;

ALTER TABLE slip_processing.payments
  ADD CONSTRAINT payments_type_chk CHECK (((payment_type)::text = ANY (ARRAY[
    'monthly'::character varying,
    'village_fund_2569'::character varying
  ]::text[])));
