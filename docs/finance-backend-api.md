# Finance Backend API — Step 2

Scope: Backend API + authorization middleware/helpers for Suan Ake finance/accounting module. Implemented on UAT only.

## Authorization

New helper files:

- `src/lib/user-roles.ts`
  - Loads active roles from `slip_processing.user_roles` + `roles`.
  - Merges legacy `web_users.role` and `web_users.is_admin` for backward compatibility.

- `src/lib/finance-auth.ts`
  - `requireAnyRole([...])`
  - `requireFinanceAccess()` allows `admin`, `accountant`, `manager`.
  - `requireExpenseRequesterRole()` allows `accountant`, `manager` for creating expense requests.
  - `assertNotSelfApproval(requestedBy, approverId)` blocks requester and approver being the same user.

Updated existing auth/session helpers:

- `src/lib/session.ts` now returns `roles` in `AppUser`.
- `src/lib/auth.ts` includes `session.user.roles`.
- `src/app/api/me/route.ts` returns `roles` to the frontend.
- `middleware.ts` protects future finance page paths at the session-cookie level:
  - `/finance`
  - `/revenue`
  - `/expenses`
  - `/reconciliation`
  - `/financial-reports`

Backend APIs enforce role authorization server-side; middleware only redirects unauthenticated page visits.

## API Routes

### Revenue

`GET /api/finance/revenue`

Filters:

- `q`
- `house_number`
- `status`
- `payment_type`
- `from`
- `to`
- `limit`
- `offset`

Returns maintenance fee rows, payments, amount paid, effective status, and summary stats.

`POST /api/finance/revenue`

Actions:

- `action: "member"` creates member/house.
- `action: "maintenance_fee"` creates a scheduled fee.
- `action: "payment"` records a payment and marks the linked maintenance fee paid if fully covered.

### Expenses + Petty Cash

`GET /api/finance/expenses`

Returns expense requests with items, approval logs, petty cash balances, and recent petty cash ledger rows.

`POST /api/finance/expenses`

Creates expense request. Requires requester to have `manager` or `accountant` role.

`PATCH /api/finance/expenses/[id]/approval`

Actions:

- `approved`
- `rejected`
- `paid`
- `cancelled`

Rules:

- Self-approval is blocked before DB update.
- Approval/rejection writes `expense_approval_logs`.
- Approved amount may exceed requested amount.
- Surplus is automatically written to `manager_petty_cash_ledger` as `receive_surplus`.

`POST /api/finance/expenses/[id]/petty-cash-spend`

Records urgent petty cash spending from manager balance. Blocks spending more than live balance.

### Reconciliation

`GET /api/finance/reconciliation`

Returns unreconciled/reconciled bank statements, splits, and candidate internal references.

`POST /api/finance/reconciliation`

Actions:

- `action: "statement"` imports/creates a bank statement line.
- `action: "split"` creates one or more bank statement splits.

The DB trigger validates that split total never exceeds the actual statement amount.

### Financial Reports

`GET /api/finance/reports`

Types:

- `type=monthly&year=YYYY&month=M`
- `type=yearly&year=YYYY`
- `type=cash_flow&year=YYYY`
- `type=balance_sheet`
- `type=profit_loss&year=YYYY`

## Verification Performed

- Docker build passed and generated all new finance API routes.
- UAT container redeployed.
- Unauthenticated API calls return `401`.
- Authenticated smoke user with `manager` + `accountant` roles received `200` from:
  - `/api/finance/revenue`
  - `/api/finance/expenses`
  - `/api/finance/reconciliation`
  - `/api/finance/reports?type=monthly`
- Created an expense request through the API.
- Self-approval attempt returned `403` with separation-of-duties error.
- Smoke test rows were soft-deleted after verification.
