-- Finance & Accounting Schema for Suan Ake Lake Park Villa
-- Scope: additive PostgreSQL migration for schema slip_processing.
-- Step 1 only: database schema / DDL. No API or UI implementation.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS slip_processing;

CREATE OR REPLACE FUNCTION slip_processing.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- RBAC: multi-role support without breaking legacy web_users.role / is_admin
-- ============================================================================
CREATE TABLE IF NOT EXISTS slip_processing.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_code VARCHAR(50) NOT NULL,
  role_name_th TEXT NOT NULL,
  role_name_en TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  CONSTRAINT roles_role_code_not_blank_chk CHECK (btrim(role_code) <> ''),
  CONSTRAINT roles_role_code_format_chk CHECK (role_code ~ '^[a-z][a-z0-9_]*$')
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_roles_role_code_active
  ON slip_processing.roles (role_code)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_roles_set_updated_at ON slip_processing.roles;
CREATE TRIGGER trg_roles_set_updated_at
  BEFORE UPDATE ON slip_processing.roles
  FOR EACH ROW EXECUTE FUNCTION slip_processing.set_updated_at();

CREATE TABLE IF NOT EXISTS slip_processing.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES slip_processing.web_users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES slip_processing.roles(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  assigned_by UUID REFERENCES slip_processing.web_users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES slip_processing.web_users(id) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_roles_user_role_active
  ON slip_processing.user_roles (user_id, role_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_roles_user_active ON slip_processing.user_roles (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_roles_role_active ON slip_processing.user_roles (role_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_user_roles_set_updated_at ON slip_processing.user_roles;
CREATE TRIGGER trg_user_roles_set_updated_at
  BEFORE UPDATE ON slip_processing.user_roles
  FOR EACH ROW EXECUTE FUNCTION slip_processing.set_updated_at();

INSERT INTO slip_processing.roles (role_code, role_name_th, role_name_en, description, is_system)
VALUES
  ('resident', 'สมาชิก/ผู้อยู่อาศัย', 'Resident', 'Village member / resident role', TRUE),
  ('admin', 'ผู้ดูแลระบบ', 'Administrator', 'System administrator role', TRUE),
  ('accountant', 'บัญชี', 'Accountant', 'Finance/accounting operator role', TRUE),
  ('manager', 'ผู้จัดการ', 'Manager', 'Village manager / expense requester role', TRUE)
ON CONFLICT DO NOTHING;

-- Backfill legacy single-role users into the multi-role table.
INSERT INTO slip_processing.user_roles (user_id, role_id, assigned_at)
SELECT wu.id, r.id, NOW()
FROM slip_processing.web_users wu
JOIN slip_processing.roles r ON r.role_code = COALESCE(NULLIF(wu.role, ''), 'resident')
WHERE wu.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- Backfill legacy is_admin flag as admin role, even if web_users.role is different.
INSERT INTO slip_processing.user_roles (user_id, role_id, assigned_at)
SELECT wu.id, r.id, NOW()
FROM slip_processing.web_users wu
JOIN slip_processing.roles r ON r.role_code = 'admin'
WHERE wu.deleted_at IS NULL AND COALESCE(wu.is_admin, FALSE) = TRUE
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Members and revenue / maintenance fee accounting
-- ============================================================================
CREATE TABLE IF NOT EXISTS slip_processing.members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  web_user_id UUID REFERENCES slip_processing.web_users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  house_number VARCHAR(50) NOT NULL,
  owner_name TEXT NOT NULL,
  contact_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  member_status VARCHAR(30) NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES slip_processing.web_users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT members_house_number_not_blank_chk CHECK (btrim(house_number) <> ''),
  CONSTRAINT members_status_chk CHECK (member_status IN ('active', 'inactive', 'transferred')),
  CONSTRAINT members_contact_info_object_chk CHECK (jsonb_typeof(contact_info) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_members_house_number_active
  ON slip_processing.members (house_number)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_members_web_user ON slip_processing.members (web_user_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_members_set_updated_at ON slip_processing.members;
CREATE TRIGGER trg_members_set_updated_at
  BEFORE UPDATE ON slip_processing.members
  FOR EACH ROW EXECUTE FUNCTION slip_processing.set_updated_at();

CREATE TABLE IF NOT EXISTS slip_processing.maintenance_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES slip_processing.members(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  fee_code VARCHAR(80),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  due_date DATE NOT NULL,
  amount_due NUMERIC(18,2) NOT NULL,
  payment_frequency VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES slip_processing.web_users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT maintenance_fees_dates_chk CHECK (period_end >= period_start),
  CONSTRAINT maintenance_fees_amount_due_chk CHECK (amount_due >= 0),
  CONSTRAINT maintenance_fees_frequency_chk CHECK (payment_frequency IN ('monthly', '3_months', '6_months', 'yearly')),
  CONSTRAINT maintenance_fees_status_chk CHECK (status IN ('pending', 'paid', 'overdue', 'waived', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_maintenance_fees_member_period_active
  ON slip_processing.maintenance_fees (member_id, period_start, period_end)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_maintenance_fees_status_due ON slip_processing.maintenance_fees (status, due_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_maintenance_fees_member ON slip_processing.maintenance_fees (member_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_maintenance_fees_set_updated_at ON slip_processing.maintenance_fees;
CREATE TRIGGER trg_maintenance_fees_set_updated_at
  BEFORE UPDATE ON slip_processing.maintenance_fees
  FOR EACH ROW EXECUTE FUNCTION slip_processing.set_updated_at();

-- Bank statements are created before payments because payments can reference a statement line.
CREATE TABLE IF NOT EXISTS slip_processing.bank_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_account VARCHAR(100),
  transaction_date DATE NOT NULL,
  posted_at TIMESTAMPTZ,
  description TEXT NOT NULL,
  external_reference VARCHAR(255),
  deposit NUMERIC(18,2) NOT NULL DEFAULT 0,
  withdraw NUMERIC(18,2) NOT NULL DEFAULT 0,
  remaining_balance NUMERIC(18,2),
  currency CHAR(3) NOT NULL DEFAULT 'THB',
  is_reconciled BOOLEAN NOT NULL DEFAULT FALSE,
  reconciled_at TIMESTAMPTZ,
  reconciled_by UUID REFERENCES slip_processing.web_users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES slip_processing.web_users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES slip_processing.web_users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT bank_statements_amount_direction_chk CHECK (
    (deposit > 0 AND withdraw = 0) OR (withdraw > 0 AND deposit = 0)
  ),
  CONSTRAINT bank_statements_non_negative_chk CHECK (deposit >= 0 AND withdraw >= 0),
  CONSTRAINT bank_statements_raw_data_object_chk CHECK (jsonb_typeof(raw_data) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_bank_statements_unreconciled ON slip_processing.bank_statements (transaction_date DESC) WHERE deleted_at IS NULL AND is_reconciled = FALSE;
CREATE INDEX IF NOT EXISTS idx_bank_statements_date ON slip_processing.bank_statements (transaction_date DESC) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_bank_statements_set_updated_at ON slip_processing.bank_statements;
CREATE TRIGGER trg_bank_statements_set_updated_at
  BEFORE UPDATE ON slip_processing.bank_statements
  FOR EACH ROW EXECUTE FUNCTION slip_processing.set_updated_at();

CREATE TABLE IF NOT EXISTS slip_processing.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES slip_processing.members(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  maintenance_fee_id UUID REFERENCES slip_processing.maintenance_fees(id) ON UPDATE CASCADE ON DELETE SET NULL,
  amount_paid NUMERIC(18,2) NOT NULL,
  payment_type VARCHAR(20) NOT NULL,
  payment_date DATE NOT NULL,
  payment_method VARCHAR(30) NOT NULL DEFAULT 'bank_transfer',
  bank_statement_line_id UUID REFERENCES slip_processing.bank_statements(id) ON UPDATE CASCADE ON DELETE SET NULL,
  receipt_number VARCHAR(80),
  status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
  notes TEXT,
  created_by UUID REFERENCES slip_processing.web_users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES slip_processing.web_users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT payments_amount_paid_chk CHECK (amount_paid > 0),
  CONSTRAINT payments_type_chk CHECK (payment_type IN ('monthly', '3_months', '6_months', 'yearly')),
  CONSTRAINT payments_method_chk CHECK (payment_method IN ('bank_transfer', 'cash', 'cheque', 'qr', 'other')),
  CONSTRAINT payments_status_chk CHECK (status IN ('draft', 'confirmed', 'voided', 'reconciled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_payments_receipt_number_active
  ON slip_processing.payments (receipt_number)
  WHERE receipt_number IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payments_member_date ON slip_processing.payments (member_id, payment_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payments_statement ON slip_processing.payments (bank_statement_line_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_payments_set_updated_at ON slip_processing.payments;
CREATE TRIGGER trg_payments_set_updated_at
  BEFORE UPDATE ON slip_processing.payments
  FOR EACH ROW EXECUTE FUNCTION slip_processing.set_updated_at();

-- Effective overdue view: keeps stored status stable but shows overdue when due_date has passed.
CREATE OR REPLACE VIEW slip_processing.v_maintenance_fee_status AS
SELECT
  mf.*,
  CASE
    WHEN mf.deleted_at IS NULL AND mf.status = 'pending' AND mf.due_date < CURRENT_DATE THEN 'overdue'
    ELSE mf.status
  END AS effective_status
FROM slip_processing.maintenance_fees mf;

-- ============================================================================
-- Expense request, approval, petty cash, and audit trail
-- ============================================================================
CREATE SEQUENCE IF NOT EXISTS slip_processing.expense_request_number_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION slip_processing.generate_expense_request_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.request_number IS NULL OR btrim(NEW.request_number) = '' THEN
    NEW.request_number := 'EXP-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('slip_processing.expense_request_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS slip_processing.expense_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  requested_by UUID NOT NULL REFERENCES slip_processing.web_users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  approved_by UUID REFERENCES slip_processing.web_users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  total_requested NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_approved NUMERIC(18,2),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  approval_notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES slip_processing.web_users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT expense_requests_title_not_blank_chk CHECK (btrim(title) <> ''),
  CONSTRAINT expense_requests_totals_chk CHECK (total_requested >= 0 AND (total_approved IS NULL OR total_approved >= 0)),
  CONSTRAINT expense_requests_status_chk CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'paid', 'cancelled')),
  CONSTRAINT expense_requests_no_self_approval_chk CHECK (approved_by IS NULL OR requested_by <> approved_by),
  CONSTRAINT expense_requests_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_expense_requests_request_number_active
  ON slip_processing.expense_requests (request_number)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expense_requests_status ON slip_processing.expense_requests (status, requested_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expense_requests_requested_by ON slip_processing.expense_requests (requested_by, requested_at DESC) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_expense_requests_number ON slip_processing.expense_requests;
CREATE TRIGGER trg_expense_requests_number
  BEFORE INSERT ON slip_processing.expense_requests
  FOR EACH ROW EXECUTE FUNCTION slip_processing.generate_expense_request_number();

DROP TRIGGER IF EXISTS trg_expense_requests_set_updated_at ON slip_processing.expense_requests;
CREATE TRIGGER trg_expense_requests_set_updated_at
  BEFORE UPDATE ON slip_processing.expense_requests
  FOR EACH ROW EXECUTE FUNCTION slip_processing.set_updated_at();

CREATE TABLE IF NOT EXISTS slip_processing.expense_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES slip_processing.expense_requests(id) ON UPDATE CASCADE ON DELETE CASCADE,
  description TEXT NOT NULL,
  category VARCHAR(80) NOT NULL,
  amount_requested NUMERIC(18,2) NOT NULL,
  amount_approved NUMERIC(18,2),
  payment_source VARCHAR(30) NOT NULL DEFAULT 'bank_transfer',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  spent_at DATE,
  receipt_file_path TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES slip_processing.web_users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT expense_items_description_not_blank_chk CHECK (btrim(description) <> ''),
  CONSTRAINT expense_items_category_not_blank_chk CHECK (btrim(category) <> ''),
  CONSTRAINT expense_items_amounts_chk CHECK (amount_requested >= 0 AND (amount_approved IS NULL OR amount_approved >= 0)),
  CONSTRAINT expense_items_payment_source_chk CHECK (payment_source IN ('bank_transfer', 'petty_cash', 'cash', 'other')),
  CONSTRAINT expense_items_status_chk CHECK (status IN ('pending', 'approved', 'rejected', 'paid', 'cancelled')),
  CONSTRAINT expense_items_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_expense_items_request ON slip_processing.expense_items (request_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expense_items_category ON slip_processing.expense_items (category) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_expense_items_set_updated_at ON slip_processing.expense_items;
CREATE TRIGGER trg_expense_items_set_updated_at
  BEFORE UPDATE ON slip_processing.expense_items
  FOR EACH ROW EXECUTE FUNCTION slip_processing.set_updated_at();

CREATE TABLE IF NOT EXISTS slip_processing.expense_approval_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES slip_processing.expense_requests(id) ON UPDATE CASCADE ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES slip_processing.web_users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  requester_user_id UUID REFERENCES slip_processing.web_users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  approver_user_id UUID REFERENCES slip_processing.web_users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  action VARCHAR(30) NOT NULL,
  old_status VARCHAR(20),
  new_status VARCHAR(20),
  old_total_approved NUMERIC(18,2),
  new_total_approved NUMERIC(18,2),
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT expense_approval_logs_action_chk CHECK (action IN ('created', 'submitted', 'approved', 'rejected', 'paid', 'cancelled', 'updated')),
  CONSTRAINT expense_approval_logs_no_self_approval_chk CHECK (action NOT IN ('approved', 'rejected') OR requester_user_id IS NULL OR actor_user_id <> requester_user_id),
  CONSTRAINT expense_approval_logs_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_expense_approval_logs_request_created ON slip_processing.expense_approval_logs (request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expense_approval_logs_actor_created ON slip_processing.expense_approval_logs (actor_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS slip_processing.manager_petty_cash_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_user_id UUID NOT NULL REFERENCES slip_processing.web_users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  request_id UUID REFERENCES slip_processing.expense_requests(id) ON UPDATE CASCADE ON DELETE SET NULL,
  expense_item_id UUID REFERENCES slip_processing.expense_items(id) ON UPDATE CASCADE ON DELETE SET NULL,
  transaction_type VARCHAR(30) NOT NULL,
  direction VARCHAR(10) NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  balance_after NUMERIC(18,2) NOT NULL,
  description TEXT NOT NULL,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES slip_processing.web_users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES slip_processing.web_users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT petty_cash_transaction_type_chk CHECK (transaction_type IN ('receive_surplus', 'spend_urgent', 'reimburse', 'return_to_bank', 'adjustment')),
  CONSTRAINT petty_cash_direction_chk CHECK (direction IN ('in', 'out')),
  CONSTRAINT petty_cash_amount_chk CHECK (amount > 0),
  CONSTRAINT petty_cash_balance_after_chk CHECK (balance_after >= 0),
  CONSTRAINT petty_cash_description_not_blank_chk CHECK (btrim(description) <> ''),
  CONSTRAINT petty_cash_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_petty_cash_manager_date ON slip_processing.manager_petty_cash_ledger (manager_user_id, transaction_date DESC, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_petty_cash_request ON slip_processing.manager_petty_cash_ledger (request_id) WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW slip_processing.v_manager_petty_cash_balance AS
SELECT DISTINCT ON (manager_user_id)
  manager_user_id,
  balance_after AS current_balance,
  transaction_date,
  created_at AS last_transaction_at
FROM slip_processing.manager_petty_cash_ledger
WHERE deleted_at IS NULL
ORDER BY manager_user_id, transaction_date DESC, created_at DESC, id DESC;

-- ============================================================================
-- Bank statement split reconciliation
-- ============================================================================
CREATE TABLE IF NOT EXISTS slip_processing.bank_statement_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_statement_line_id UUID NOT NULL REFERENCES slip_processing.bank_statements(id) ON UPDATE CASCADE ON DELETE CASCADE,
  reference_type VARCHAR(40) NOT NULL,
  reference_id UUID NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  split_note TEXT,
  created_by UUID NOT NULL REFERENCES slip_processing.web_users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES slip_processing.web_users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT bank_statement_splits_reference_type_chk CHECK (reference_type IN ('payment', 'expense_item', 'expense_request', 'petty_cash_ledger')),
  CONSTRAINT bank_statement_splits_amount_chk CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_bank_statement_splits_line ON slip_processing.bank_statement_splits (bank_statement_line_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bank_statement_splits_reference ON slip_processing.bank_statement_splits (reference_type, reference_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bank_statement_splits_created_by ON slip_processing.bank_statement_splits (created_by, created_at DESC);

DROP TRIGGER IF EXISTS trg_bank_statement_splits_set_updated_at ON slip_processing.bank_statement_splits;
CREATE TRIGGER trg_bank_statement_splits_set_updated_at
  BEFORE UPDATE ON slip_processing.bank_statement_splits
  FOR EACH ROW EXECUTE FUNCTION slip_processing.set_updated_at();

CREATE OR REPLACE FUNCTION slip_processing.validate_bank_statement_split_sum()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_statement_id UUID;
  v_statement_amount NUMERIC(18,2);
  v_split_total NUMERIC(18,2);
BEGIN
  v_statement_id := COALESCE(NEW.bank_statement_line_id, OLD.bank_statement_line_id);

  SELECT (COALESCE(deposit, 0) + COALESCE(withdraw, 0))
    INTO v_statement_amount
  FROM slip_processing.bank_statements
  WHERE id = v_statement_id AND deleted_at IS NULL;

  IF v_statement_amount IS NULL THEN
    RAISE EXCEPTION 'Bank statement line % not found or deleted', v_statement_id;
  END IF;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_split_total
  FROM slip_processing.bank_statement_splits
  WHERE bank_statement_line_id = v_statement_id
    AND deleted_at IS NULL
    AND (TG_OP = 'DELETE' OR id <> COALESCE(NEW.id, OLD.id));

  IF TG_OP <> 'DELETE' AND NEW.deleted_at IS NULL THEN
    v_split_total := v_split_total + NEW.amount;
  END IF;

  IF v_split_total > v_statement_amount THEN
    RAISE EXCEPTION 'Split total % exceeds bank statement amount % for line %', v_split_total, v_statement_amount, v_statement_id;
  END IF;

  UPDATE slip_processing.bank_statements
  SET is_reconciled = (v_split_total = v_statement_amount),
      reconciled_at = CASE WHEN v_split_total = v_statement_amount THEN COALESCE(reconciled_at, NOW()) ELSE NULL END,
      updated_at = NOW()
  WHERE id = v_statement_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_bank_statement_splits_validate_sum ON slip_processing.bank_statement_splits;
CREATE TRIGGER trg_bank_statement_splits_validate_sum
  AFTER INSERT OR UPDATE OR DELETE ON slip_processing.bank_statement_splits
  FOR EACH ROW EXECUTE FUNCTION slip_processing.validate_bank_statement_split_sum();

CREATE OR REPLACE VIEW slip_processing.v_bank_statement_reconciliation AS
SELECT
  bs.id,
  bs.transaction_date,
  bs.description,
  bs.deposit,
  bs.withdraw,
  (COALESCE(bs.deposit, 0) + COALESCE(bs.withdraw, 0)) AS statement_amount,
  COALESCE(SUM(bss.amount) FILTER (WHERE bss.deleted_at IS NULL), 0) AS split_amount,
  (COALESCE(bs.deposit, 0) + COALESCE(bs.withdraw, 0)) - COALESCE(SUM(bss.amount) FILTER (WHERE bss.deleted_at IS NULL), 0) AS unreconciled_amount,
  bs.is_reconciled
FROM slip_processing.bank_statements bs
LEFT JOIN slip_processing.bank_statement_splits bss ON bss.bank_statement_line_id = bs.id
WHERE bs.deleted_at IS NULL
GROUP BY bs.id;

-- Documentation comments
COMMENT ON TABLE slip_processing.roles IS 'System RBAC roles. Additive multi-role model; legacy web_users.role remains for backward compatibility.';
COMMENT ON TABLE slip_processing.user_roles IS 'Many-to-many mapping between web users and roles. Users may be admin, accountant, manager, and/or resident simultaneously.';
COMMENT ON TABLE slip_processing.members IS 'Village members / houses used for maintenance fee revenue tracking.';
COMMENT ON TABLE slip_processing.maintenance_fees IS 'Scheduled maintenance/common-area fee receivables by member and period.';
COMMENT ON TABLE slip_processing.payments IS 'Confirmed member payments for maintenance fees; can later be reconciled to bank statement lines.';
COMMENT ON TABLE slip_processing.expense_requests IS 'Expense approval requests submitted by manager/accountant and approved by a separate user.';
COMMENT ON TABLE slip_processing.expense_items IS 'Line items within an expense request.';
COMMENT ON TABLE slip_processing.expense_approval_logs IS 'Append-only audit trail for all expense request approval/status actions.';
COMMENT ON TABLE slip_processing.manager_petty_cash_ledger IS 'Petty cash ledger tracking cash held by each manager, including surplus approvals and urgent spending.';
COMMENT ON TABLE slip_processing.bank_statements IS 'Imported bank statement transaction lines.';
COMMENT ON TABLE slip_processing.bank_statement_splits IS 'Reconciliation splits mapping a single bank statement line to multiple system references.';

COMMIT;
