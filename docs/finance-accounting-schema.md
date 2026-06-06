# Finance & Accounting Schema — Suan Ake Lake Park Villa

Scope: Step 1 database schema only. This document describes the additive PostgreSQL schema in `slip_processing` for managing juristic-person revenue, expenses, petty cash, bank reconciliation, and accounting reports.

Migration file:

- `db/migrations/20260603040624_finance_accounting_schema.sql`

## 1. Architecture Overview

The design is additive and keeps the existing Suan Ake web system stable:

- Existing auth table `slip_processing.web_users` is not broken or replaced.
- New RBAC tables `roles` and `user_roles` support multi-role users while preserving legacy `web_users.role` and `web_users.is_admin`.
- Revenue uses `members`, `maintenance_fees`, and `payments` to separate houses, scheduled receivables, and actual payment events.
- Expense management uses a header/detail model: `expense_requests` and `expense_items`.
- Petty cash is tracked as an append-style ledger in `manager_petty_cash_ledger`; the live balance is exposed via `v_manager_petty_cash_balance`.
- Approval audit history is stored in `expense_approval_logs` and is designed to be append-only from the application layer.
- Bank reconciliation supports split matching using `bank_statements` and `bank_statement_splits`.
- Currency fields use `NUMERIC(18,2)`, not floating point.
- All key domain tables include `created_at`, `updated_at`, and `deleted_at` for auditability and soft delete.

## 2. ERD Text Representation

```text
web_users 1 ──< user_roles >── 1 roles

web_users 1 ──< members
members 1 ──< maintenance_fees
members 1 ──< payments
maintenance_fees 1 ──< payments
bank_statements 1 ──< payments (optional direct line link)

web_users 1 ──< expense_requests.requested_by
web_users 1 ──< expense_requests.approved_by
expense_requests 1 ──< expense_items
expense_requests 1 ──< expense_approval_logs
web_users 1 ──< expense_approval_logs.actor_user_id

web_users 1 ──< manager_petty_cash_ledger.manager_user_id
expense_requests 1 ──< manager_petty_cash_ledger
expense_items 1 ──< manager_petty_cash_ledger

bank_statements 1 ──< bank_statement_splits
bank_statement_splits.reference_id → payments | expense_items | expense_requests | manager_petty_cash_ledger
```

## 3. Data Dictionary Summary

### RBAC

- `roles`
  - `role_code`: stable code such as `resident`, `admin`, `accountant`, `manager`
  - `role_name_th`, `role_name_en`: bilingual display names
  - `is_system`: protects built-in roles conceptually

- `user_roles`
  - `user_id`: FK to `web_users`
  - `role_id`: FK to `roles`
  - `assigned_by`, `assigned_at`: role assignment audit fields
  - Active uniqueness: one active row per user/role

### Revenue

- `members`
  - `house_number`: unique active house reference
  - `owner_name`: current owner/member display name
  - `contact_info`: JSONB object for phone/email/LINE metadata
  - `member_status`: `active`, `inactive`, `transferred`

- `maintenance_fees`
  - `member_id`: house/member that owes the fee
  - `period_start`, `period_end`, `due_date`: billing period and deadline
  - `amount_due`: receivable amount
  - `payment_frequency`: `monthly`, `3_months`, `6_months`, `yearly`
  - `status`: `pending`, `paid`, `overdue`, `waived`, `cancelled`

- `payments`
  - `member_id`, `maintenance_fee_id`: paid by whom and for which scheduled fee
  - `amount_paid`, `payment_type`, `payment_date`
  - `bank_statement_line_id`: optional direct reconciliation link
  - `status`: `draft`, `confirmed`, `voided`, `reconciled`

- `v_maintenance_fee_status`
  - Adds `effective_status`, converting pending rows past due date into `overdue` for reporting.

### Expense and Petty Cash

- `expense_requests`
  - `request_number`: generated code like `EXP-2026-000001`
  - `requested_by`: manager/accountant who submitted the request
  - `approved_by`: approver, if approved/rejected
  - `total_requested`, `total_approved`: approved amount may be more than requested
  - `status`: `draft`, `pending`, `approved`, `rejected`, `paid`, `cancelled`
  - DB CHECK prevents `requested_by = approved_by`

- `expense_items`
  - `request_id`: parent expense request
  - `description`, `category`
  - `amount_requested`, `amount_approved`
  - `payment_source`: `bank_transfer`, `petty_cash`, `cash`, `other`

- `expense_approval_logs`
  - `actor_user_id`: user who made the action
  - `requester_user_id`, `approver_user_id`: snapshot of business actors
  - `action`: `created`, `submitted`, `approved`, `rejected`, `paid`, `cancelled`, `updated`
  - `old_status`, `new_status`, old/new approved totals, notes, metadata
  - CHECK prevents an approval/rejection log where actor equals requester.

- `manager_petty_cash_ledger`
  - `manager_user_id`: manager holding the cash
  - `transaction_type`: `receive_surplus`, `spend_urgent`, `reimburse`, `return_to_bank`, `adjustment`
  - `direction`: `in` or `out`
  - `amount`, `balance_after`: supports audit of cash held by manager

- `v_manager_petty_cash_balance`
  - Shows the latest balance for each manager.

### Bank Statement Reconciliation

- `bank_statements`
  - `transaction_date`, `description`
  - `deposit` or `withdraw`: exactly one must be positive
  - `remaining_balance`
  - `is_reconciled`, `reconciled_at`, `reconciled_by`
  - `raw_data`: optional import metadata

- `bank_statement_splits`
  - `bank_statement_line_id`: parent statement line
  - `reference_type`: `payment`, `expense_item`, `expense_request`, `petty_cash_ledger`
  - `reference_id`: UUID of matched internal record
  - `amount`: split amount
  - `created_by`: user who reconciled/split

- `v_bank_statement_reconciliation`
  - Shows statement amount, split amount, unreconciled amount, and reconciliation status.

## 4. Key Accounting and Security Rules

1. Multi-role users
   - Users can have more than one active role through `user_roles`.
   - Legacy `web_users.role` and `is_admin` are backfilled into `user_roles` but not removed.

2. New finance pages access
   - API middleware should allow any of: `admin`, `accountant`, `manager`.
   - Enforcement is done in backend logic in the next step using `user_roles`.

3. Separation of Duties
   - Expense requester and approver must not be the same person.
   - The database has a CHECK constraint on `expense_requests` and another CHECK on approval log rows.
   - The backend must still validate before update and return a clear error.

4. Expense approval over requested amount
   - `total_approved` is allowed to be greater than `total_requested`.
   - The surplus should be recorded as `manager_petty_cash_ledger.transaction_type = 'receive_surplus'` in the API step.

5. Petty cash auditability
   - Never overwrite current balance manually without a ledger row.
   - Use `manager_petty_cash_ledger` as the source of truth.
   - `v_manager_petty_cash_balance` reads the latest ledger entry per manager.

6. Overdue maintenance fees
   - Use `maintenance_fees.due_date` and `v_maintenance_fee_status.effective_status` to detect overdue balances.

7. Bank statement split validation
   - Trigger `validate_bank_statement_split_sum()` prevents split totals from exceeding the statement amount.
   - Statement becomes reconciled when split total exactly equals deposit/withdraw amount.

## 5. Next Implementation Step

After JoJoe San confirms, Step 2 should implement:

- Authorization helper supporting role arrays: `requireAnyRole(['admin', 'accountant', 'manager'])`
- APIs for revenue, expenses, petty cash, and reconciliation
- Self-approval backend validation with immediate error response
- Automatic writes to `expense_approval_logs`
- Reconciliation split create/update/delete APIs using DB trigger protection
