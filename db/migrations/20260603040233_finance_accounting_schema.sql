-- Finance/accounting schema for Suan Ake juristic village management
-- Scope: additive database schema only. No API/UI changes.
-- Target database: UAT first (slip_processing_uat), schema slip_processing.

BEGIN;

CREATE SCHEMA IF NOT EXISTS slip_processing;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Generic updated_at trigger used by finance/accounting tables.
CREATE OR REPLACE FUNCTION slip_processing.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- RBAC: additive multi-role support, preserving legacy web_users.role/is_admin.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS slip_processing.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name_th TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT roles_code_format_chk CHECK (code ~ '^[a-z][a-z0-9_]*$')
);

CREATE TRIGGER trg_roles_set_updated_at
BEFORE UPDATE ON slip_processing.roles
FOR EACH ROW EXECUTE FUNCTION slip_processing.set_updated_at();

INSERT INTO slip_processing.roles (code, name_th, name_en, description, is_system)
VALUES
  ('resident', 'ลูกบ้าน/สมาชิก', 'Resident', 'Village resident/member role', TRUE),
  ('admin', 'ผู้ดูแลระบบ', 'Admin', 'System administration role', TRUE),
  ('accountant', 'บัญชี', 'Accountant', 'Finance/accounting operator role', TRUE),
  ('manager', 'ผู้จัดการ', 'Manager', 'Village manager role', TRUE)
ON CONFLICT (code) DO UPDATE SET
  name_th = EXCLUDED.name_th,
  name_en = EXCLUDED.name_en,
  description = EXCLUDED.description,
  is_system = TRUE,
  updated_at = NOW(),
  deleted_at = NULL;

CREATE TABLE IF NOT EXISTS slip_processing.user_roles (
  user_id UUID NOT NULL REFERENCES slip_processing.web_users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES slip_processing.roles(id) ON DELETE RESTRICT,
  assigned_by_user_id UUID REFERENCES slip_processing.web_users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT user_roles_expiry_chk CHECK (expires_at IS NULL OR expires_at > assigned_at)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON slip_processing.user_roles(role_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_roles_user_active ON slip_processing.user_roles(user_id) WHERE deleted_at IS NULL;

-- Safe backfill from legacy single-role auth without modifying/dropping legacy columns.
INSERT INTO slip_processing.user_roles (user_id, role_id, assigned_at)
SELECT wu.id, r.id, NOW()
FROM slip_processing.web_users wu
JOIN slip_processing.roles r ON r.code = COALESCE(NULLIF(LOWER(wu.role), ''), 'resident')
WHERE wu.deleted_at IS NULL
ON CONFLICT (user_id, role_id) DO UPDATE SET deleted_at = NULL;

INSERT INTO slip_processing.user_roles (user_id, role_id, assigned_at)
SELECT wu.id, r.id, NOW()
FROM slip_processing.web_users wu
JOIN slip_processing.roles r ON r.code = 'admin'
WHERE wu.deleted_at IS NULL AND COALESCE(wu.is_admin, FALSE) = TRUE
ON CONFLICT (user_id, role_id) DO UPDATE SET deleted_at = NULL;

-- -----------------------------------------------------------------------------
-- Revenue: members/houses, recurring maintenance fee schedules, charge instances,
-- and finance payments. Existing payment_slips are not modified.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS slip_processing.members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  web_user_id UUID REFERENCES slip_processing.web_users(id) ON DELETE SET NULL,
  member_code TEXT UNIQUE,
  house_number TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  resident_name TEXT,
  phone TEXT,
  email TEXT,
  move_in_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_by_user_id UUID REFERENCES slip_processing.web_users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES slip_processing.web_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT members_email_chk CHECK (email IS NULL OR email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_members_active_house_number
ON slip_processing.members (LOWER(house_number)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_members_web_user_id ON slip_processing.members(web_user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_members_active ON slip_processing.members(is_active) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_members_set_updated_at
BEFORE UPDATE ON slip_processing.members
FOR EACH ROW EXECUTE FUNCTION slip_processing.set_updated_at();

CREATE TABLE IF NOT EXISTS slip_processing.maintenance_fee_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES slip_processing.members(id) ON DELETE RESTRICT,
  billing_period TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  due_day SMALLINT NOT NULL DEFAULT 1,
  grace_days INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_by_user_id UUID REFERENCES slip_processing.web_users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES slip_processing.web_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT maintenance_fee_schedules_billing_period_chk CHECK (billing_period IN ('monthly', '3_months', '6_months', 'yearly')),
  CONSTRAINT maintenance_fee_schedules_amount_chk CHECK (amount >= 0),
  CONSTRAINT maintenance_fee_schedules_due_day_chk CHECK (due_day BETWEEN 1 AND 31),
  CONSTRAINT maintenance_fee_schedules_grace_days_chk CHECK (grace_days >= 0),
  CONSTRAINT maintenance_fee_schedules_date_chk CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_maintenance_fee_schedules_member_active
ON slip_processing.maintenance_fee_schedules(member_id, is_active) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_maintenance_fee_schedules_set_updated_at
BEFORE UPDATE ON slip_processing.maintenance_fee_schedules
FOR EACH ROW EXECUTE FUNCTION slip_processing.set_updated_at();

CREATE TABLE IF NOT EXISTS slip_processing.maintenance_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID REFERENCES slip_processing.maintenance_fee_schedules(id) ON DELETE SET NULL,
  member_id UUID NOT NULL REFERENCES slip_processing.members(id) ON DELETE RESTRICT,
  billing_period TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  due_date DATE NOT NULL,
  amount_due NUMERIC(18,2) NOT NULL,
  amount_paid NUMERIC(18,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_by_user_id UUID REFERENCES slip_processing.web_users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES slip_processing.web_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT maintenance_fees_billing_period_chk CHECK (billing_period IN ('monthly', '3_months', '6_months', 'yearly')),
  CONSTRAINT maintenance_fees_amount_due_chk CHECK (amount_due >= 0),
  CONSTRAINT maintenance_fees_amount_paid_chk CHECK (amount_paid >= 0 AND amount_paid <= amount_due),
  CONSTRAINT maintenance_fees_period_chk CHECK (period_end >= period_start),
  CONSTRAINT maintenance_fees_status_chk CHECK (status IN ('pending', 'partial', 'paid', 'overdue', 'waived', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_maintenance_fees_member_period
ON slip_processing.maintenance_fees(member_id, period_start, period_end)
WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_maintenance_fees_due_status
ON slip_processing.maintenance_fees(due_date, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_maintenance_fees_member_status
ON slip_processing.maintenance_fees(member_id, status) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_maintenance_fees_set_updated_at
BEFORE UPDATE ON slip_processing.maintenance_fees
FOR EACH ROW EXECUTE FUNCTION slip_processing.set_updated_at();

CREATE TABLE IF NOT EXISTS slip_processing.finance_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES slip_processing.members(id) ON DELETE SET NULL,
  maintenance_fee_id UUID REFERENCES slip_processing.maintenance_fees(id) ON DELETE SET NULL,
  payment_slip_id UUID REFERENCES slip_processing.payment_slips(id) ON DELETE SET NULL,
  payment_number TEXT UNIQUE,
  payment_type TEXT NOT NULL DEFAULT 'maintenance_fee',
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer',
  amount NUMERIC(18,2) NOT NULL,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_by_user_id UUID REFERENCES slip_processing.web_users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'received',
  reference_no TEXT,
  notes TEXT,
  created_by_user_id UUID REFERENCES slip_processing.web_users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES slip_processing.web_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT finance_payments_amount_chk CHECK (amount > 0),
  CONSTRAINT finance_payments_type_chk CHECK (payment_type IN ('maintenance_fee', 'other_income', 'adjustment')),
  CONSTRAINT finance_payments_method_chk CHECK (payment_method IN ('cash', 'bank_transfer', 'qr', 'cheque', 'other')),
  CONSTRAINT finance_payments_status_chk CHECK (status IN ('draft', 'received', 'reconciled', 'voided', 'refunded'))
);

CREATE INDEX IF NOT EXISTS idx_finance_payments_member_paid_at
ON slip_processing.finance_payments(member_id, paid_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_finance_payments_maintenance_fee
ON slip_processing.finance_payments(maintenance_fee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_finance_payments_status
ON slip_processing.finance_payments(status) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_finance_payments_set_updated_at
BEFORE UPDATE ON slip_processing.finance_payments
FOR EACH ROW EXECUTE FUNCTION slip_processing.set_updated_at();

-- -----------------------------------------------------------------------------
-- Expenses, approvals, and manager petty cash.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS slip_processing.expense_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number TEXT UNIQUE,
  requester_user_id UUID NOT NULL REFERENCES slip_processing.web_users(id) ON DELETE RESTRICT,
  manager_user_id UUID REFERENCES slip_processing.web_users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  requested_total NUMERIC(18,2) NOT NULL DEFAULT 0,
  approved_total NUMERIC(18,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMPTZ,
  approved_by_user_id UUID REFERENCES slip_processing.web_users(id) ON DELETE RESTRICT,
  approved_at TIMESTAMPTZ,
  rejected_by_user_id UUID REFERENCES slip_processing.web_users(id) ON DELETE RESTRICT,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  paid_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  notes TEXT,
  created_by_user_id UUID REFERENCES slip_processing.web_users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES slip_processing.web_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT expense_requests_requested_total_chk CHECK (requested_total >= 0),
  CONSTRAINT expense_requests_approved_total_chk CHECK (approved_total >= 0),
  CONSTRAINT expense_requests_status_chk CHECK (status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'paid', 'closed', 'cancelled')),
  CONSTRAINT expense_requests_no_self_approve_chk CHECK (approved_by_user_id IS NULL OR approved_by_user_id <> requester_user_id),
  CONSTRAINT expense_requests_no_self_reject_chk CHECK (rejected_by_user_id IS NULL OR rejected_by_user_id <> requester_user_id)
);

CREATE INDEX IF NOT EXISTS idx_expense_requests_requester_status
ON slip_processing.expense_requests(requester_user_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expense_requests_manager_status
ON slip_processing.expense_requests(manager_user_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expense_requests_status_created
ON slip_processing.expense_requests(status, created_at DESC) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_expense_requests_set_updated_at
BEFORE UPDATE ON slip_processing.expense_requests
FOR EACH ROW EXECUTE FUNCTION slip_processing.set_updated_at();

CREATE TABLE IF NOT EXISTS slip_processing.expense_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_request_id UUID NOT NULL REFERENCES slip_processing.expense_requests(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  vendor_name TEXT,
  receipt_no TEXT,
  requested_amount NUMERIC(18,2) NOT NULL,
  approved_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  actual_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  spent_at DATE,
  receipt_document_id UUID REFERENCES slip_processing.documents(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT expense_items_line_no_chk CHECK (line_no > 0),
  CONSTRAINT expense_items_requested_amount_chk CHECK (requested_amount >= 0),
  CONSTRAINT expense_items_approved_amount_chk CHECK (approved_amount >= 0),
  CONSTRAINT expense_items_actual_amount_chk CHECK (actual_amount >= 0),
  CONSTRAINT expense_items_status_chk CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'paid', 'settled', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_items_request_line
ON slip_processing.expense_items(expense_request_id, line_no) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expense_items_request
ON slip_processing.expense_items(expense_request_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expense_items_category
ON slip_processing.expense_items(category) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_expense_items_set_updated_at
BEFORE UPDATE ON slip_processing.expense_items
FOR EACH ROW EXECUTE FUNCTION slip_processing.set_updated_at();

CREATE TABLE IF NOT EXISTS slip_processing.expense_approval_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_request_id UUID NOT NULL REFERENCES slip_processing.expense_requests(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES slip_processing.web_users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  comment TEXT,
  requested_total_snapshot NUMERIC(18,2),
  approved_total_snapshot NUMERIC(18,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT expense_approval_logs_action_chk CHECK (action IN ('created', 'submitted', 'reviewed', 'approved', 'rejected', 'paid', 'closed', 'cancelled', 'edited')),
  CONSTRAINT expense_approval_logs_status_chk CHECK (to_status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'paid', 'closed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_expense_approval_logs_request_created
ON slip_processing.expense_approval_logs(expense_request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expense_approval_logs_actor
ON slip_processing.expense_approval_logs(actor_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS slip_processing.manager_petty_cash_accounts (
  manager_user_id UUID PRIMARY KEY REFERENCES slip_processing.web_users(id) ON DELETE RESTRICT,
  current_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency_code CHAR(3) NOT NULL DEFAULT 'THB',
  last_entry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT manager_petty_cash_accounts_balance_chk CHECK (current_balance >= 0),
  CONSTRAINT manager_petty_cash_accounts_currency_chk CHECK (currency_code ~ '^[A-Z]{3}$')
);

CREATE TRIGGER trg_manager_petty_cash_accounts_set_updated_at
BEFORE UPDATE ON slip_processing.manager_petty_cash_accounts
FOR EACH ROW EXECUTE FUNCTION slip_processing.set_updated_at();

CREATE TABLE IF NOT EXISTS slip_processing.manager_petty_cash_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_user_id UUID NOT NULL REFERENCES slip_processing.web_users(id) ON DELETE RESTRICT,
  expense_request_id UUID REFERENCES slip_processing.expense_requests(id) ON DELETE SET NULL,
  expense_item_id UUID REFERENCES slip_processing.expense_items(id) ON DELETE SET NULL,
  entry_type TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  balance_after NUMERIC(18,2),
  description TEXT NOT NULL,
  reference_no TEXT,
  created_by_user_id UUID REFERENCES slip_processing.web_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT manager_petty_cash_ledger_amount_chk CHECK (amount <> 0),
  CONSTRAINT manager_petty_cash_ledger_balance_after_chk CHECK (balance_after IS NULL OR balance_after >= 0),
  CONSTRAINT manager_petty_cash_ledger_entry_type_chk CHECK (entry_type IN ('surplus_credit', 'advance', 'expense_spend', 'return_to_bank', 'adjustment_credit', 'adjustment_debit'))
);

CREATE INDEX IF NOT EXISTS idx_manager_petty_cash_ledger_manager_created
ON slip_processing.manager_petty_cash_ledger(manager_user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_manager_petty_cash_ledger_expense_request
ON slip_processing.manager_petty_cash_ledger(expense_request_id) WHERE deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- Bank statements and reconciliation splits.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS slip_processing.bank_statement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_name TEXT NOT NULL,
  bank_account_no TEXT,
  statement_date DATE NOT NULL,
  posted_at TIMESTAMPTZ,
  direction TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'THB',
  description TEXT,
  bank_reference TEXT,
  raw_payload JSONB,
  status TEXT NOT NULL DEFAULT 'unreconciled',
  imported_by_user_id UUID REFERENCES slip_processing.web_users(id) ON DELETE SET NULL,
  reconciled_by_user_id UUID REFERENCES slip_processing.web_users(id) ON DELETE SET NULL,
  reconciled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT bank_statement_lines_direction_chk CHECK (direction IN ('deposit', 'withdrawal')),
  CONSTRAINT bank_statement_lines_amount_chk CHECK (amount > 0),
  CONSTRAINT bank_statement_lines_currency_chk CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT bank_statement_lines_status_chk CHECK (status IN ('unreconciled', 'partial', 'reconciled', 'ignored'))
);

CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_date_direction
ON slip_processing.bank_statement_lines(statement_date DESC, direction) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_status
ON slip_processing.bank_statement_lines(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_reference
ON slip_processing.bank_statement_lines(bank_reference) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_bank_statement_lines_set_updated_at
BEFORE UPDATE ON slip_processing.bank_statement_lines
FOR EACH ROW EXECUTE FUNCTION slip_processing.set_updated_at();

CREATE TABLE IF NOT EXISTS slip_processing.bank_statement_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_statement_line_id UUID NOT NULL REFERENCES slip_processing.bank_statement_lines(id) ON DELETE CASCADE,
  reference_type TEXT NOT NULL,
  reference_id UUID NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  notes TEXT,
  created_by_user_id UUID REFERENCES slip_processing.web_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT bank_statement_splits_amount_chk CHECK (amount > 0),
  CONSTRAINT bank_statement_splits_reference_type_chk CHECK (reference_type IN ('finance_payment', 'maintenance_fee', 'expense_request', 'expense_item', 'petty_cash_ledger', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_bank_statement_splits_line
ON slip_processing.bank_statement_splits(bank_statement_line_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bank_statement_splits_reference
ON slip_processing.bank_statement_splits(reference_type, reference_id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_bank_statement_splits_set_updated_at
BEFORE UPDATE ON slip_processing.bank_statement_splits
FOR EACH ROW EXECUTE FUNCTION slip_processing.set_updated_at();

CREATE OR REPLACE FUNCTION slip_processing.validate_bank_statement_split_total()
RETURNS TRIGGER AS $$
DECLARE
  v_line_id UUID;
  v_statement_amount NUMERIC(18,2);
  v_split_total NUMERIC(18,2);
BEGIN
  v_line_id := COALESCE(NEW.bank_statement_line_id, OLD.bank_statement_line_id);

  SELECT amount INTO v_statement_amount
  FROM slip_processing.bank_statement_lines
  WHERE id = v_line_id AND deleted_at IS NULL;

  IF v_statement_amount IS NULL THEN
    RAISE EXCEPTION 'Bank statement line % does not exist or is deleted', v_line_id;
  END IF;

  SELECT COALESCE(SUM(amount), 0)::NUMERIC(18,2) INTO v_split_total
  FROM slip_processing.bank_statement_splits
  WHERE bank_statement_line_id = v_line_id
    AND deleted_at IS NULL
    AND (TG_OP <> 'UPDATE' OR id <> NEW.id);

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.deleted_at IS NULL THEN
    v_split_total := v_split_total + NEW.amount;
  END IF;

  IF v_split_total > v_statement_amount THEN
    RAISE EXCEPTION 'Bank statement split total % exceeds statement amount % for line %', v_split_total, v_statement_amount, v_line_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bank_statement_splits_validate_total ON slip_processing.bank_statement_splits;
CREATE TRIGGER trg_bank_statement_splits_validate_total
BEFORE INSERT OR UPDATE ON slip_processing.bank_statement_splits
FOR EACH ROW EXECUTE FUNCTION slip_processing.validate_bank_statement_split_total();

CREATE OR REPLACE FUNCTION slip_processing.refresh_bank_statement_reconciliation_status()
RETURNS TRIGGER AS $$
DECLARE
  v_line_id UUID;
  v_statement_amount NUMERIC(18,2);
  v_split_total NUMERIC(18,2);
  v_new_status TEXT;
BEGIN
  v_line_id := COALESCE(NEW.bank_statement_line_id, OLD.bank_statement_line_id);

  SELECT amount INTO v_statement_amount
  FROM slip_processing.bank_statement_lines
  WHERE id = v_line_id AND deleted_at IS NULL;

  IF v_statement_amount IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(amount), 0)::NUMERIC(18,2) INTO v_split_total
  FROM slip_processing.bank_statement_splits
  WHERE bank_statement_line_id = v_line_id AND deleted_at IS NULL;

  v_new_status := CASE
    WHEN v_split_total = 0 THEN 'unreconciled'
    WHEN v_split_total < v_statement_amount THEN 'partial'
    ELSE 'reconciled'
  END;

  UPDATE slip_processing.bank_statement_lines
  SET status = v_new_status,
      reconciled_at = CASE WHEN v_new_status = 'reconciled' THEN COALESCE(reconciled_at, NOW()) ELSE reconciled_at END,
      updated_at = NOW()
  WHERE id = v_line_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bank_statement_splits_refresh_status ON slip_processing.bank_statement_splits;
CREATE TRIGGER trg_bank_statement_splits_refresh_status
AFTER INSERT OR UPDATE OR DELETE ON slip_processing.bank_statement_splits
FOR EACH ROW EXECUTE FUNCTION slip_processing.refresh_bank_statement_reconciliation_status();

-- Petty cash account balance maintenance. Signed ledger amounts update live balance.
CREATE OR REPLACE FUNCTION slip_processing.apply_manager_petty_cash_ledger()
RETURNS TRIGGER AS $$
DECLARE
  v_new_balance NUMERIC(18,2);
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Physical delete is not allowed for petty cash ledger; use deleted_at reversal/adjustment instead';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Posted petty cash ledger rows are immutable; create an adjustment row instead';
  END IF;

  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO slip_processing.manager_petty_cash_accounts (manager_user_id, current_balance, last_entry_at)
  VALUES (NEW.manager_user_id, 0, NOW())
  ON CONFLICT (manager_user_id) DO NOTHING;

  UPDATE slip_processing.manager_petty_cash_accounts
  SET current_balance = current_balance + NEW.amount,
      last_entry_at = NOW(),
      updated_at = NOW()
  WHERE manager_user_id = NEW.manager_user_id
  RETURNING current_balance INTO v_new_balance;

  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'Petty cash balance cannot become negative for manager %', NEW.manager_user_id;
  END IF;

  NEW.balance_after := v_new_balance;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_manager_petty_cash_ledger_apply ON slip_processing.manager_petty_cash_ledger;
CREATE TRIGGER trg_manager_petty_cash_ledger_apply
BEFORE INSERT OR UPDATE OR DELETE ON slip_processing.manager_petty_cash_ledger
FOR EACH ROW EXECUTE FUNCTION slip_processing.apply_manager_petty_cash_ledger();

-- -----------------------------------------------------------------------------
-- Comments for schema discoverability.
-- -----------------------------------------------------------------------------

COMMENT ON TABLE slip_processing.roles IS 'System roles for additive multi-role RBAC. Legacy web_users.role/is_admin remain for backwards compatibility.';
COMMENT ON TABLE slip_processing.user_roles IS 'Many-to-many role assignments for web_users; backfilled from legacy web_users.role and is_admin.';
COMMENT ON TABLE slip_processing.members IS 'Village members/houses used for billing maintenance fees.';
COMMENT ON TABLE slip_processing.maintenance_fee_schedules IS 'Recurring maintenance fee schedules per member/house: monthly, 3_months, 6_months, yearly.';
COMMENT ON TABLE slip_processing.maintenance_fees IS 'Generated/assessed maintenance fee receivables with due dates and overdue-capable status.';
COMMENT ON TABLE slip_processing.finance_payments IS 'Internal finance payment records; may link to existing payment_slips without changing it.';
COMMENT ON TABLE slip_processing.expense_requests IS 'Expense/petty cash requests submitted by manager/accountant with DB-level no-self-approval checks.';
COMMENT ON TABLE slip_processing.expense_items IS 'Line items for expense requests; approved_amount may exceed requested_amount to represent petty cash surplus.';
COMMENT ON TABLE slip_processing.expense_approval_logs IS 'Immutable-ish approval/status audit trail for expense requests.';
COMMENT ON TABLE slip_processing.manager_petty_cash_accounts IS 'Current live petty cash balance per manager.';
COMMENT ON TABLE slip_processing.manager_petty_cash_ledger IS 'Signed petty cash audit ledger. Positive = credit, negative = spend/return/debit.';
COMMENT ON TABLE slip_processing.bank_statement_lines IS 'Imported bank statement deposits/withdrawals for reconciliation.';
COMMENT ON TABLE slip_processing.bank_statement_splits IS 'One bank statement line split across one or many internal references; trigger enforces split total <= statement amount.';

COMMIT;
