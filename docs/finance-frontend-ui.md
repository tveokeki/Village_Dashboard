# Finance Frontend UI/UX — UAT

## Design owner
Agent Ive provided the UI/UX direction; Jarvis implemented the frontend in the UAT Next.js app.

## UX principles
- Mobile-first finance workspace for village staff.
- Use existing Suan Ake visual language: white cards, rounded panels, soft green brand accents, compact KPI cards.
- Thai-first labels with English fallback through the existing language context.
- High-signal screens: top-level KPIs, filters, then action-oriented tables/cards.
- Keep backend controls authoritative: UI shows workflows, backend enforces RBAC and SOD.

## New protected pages
- `/revenue` — maintenance fee revenue dashboard, filters, member/fee/payment forms.
- `/expenses` — expense requests, approval actions, petty cash balance and ledger.
- `/reconciliation` — bank statement import form and matching drawer.
- `/financial-reports` — monthly/yearly/cash-flow/balance-sheet/profit-loss report views.

## Shared components
- `src/components/finance/FinancePageHeader.tsx`
- `src/components/finance/KpiCard.tsx`
- `src/components/finance/FinanceTabs.tsx`
- `src/components/finance/FinanceStatusBadge.tsx`
- `src/components/finance/finance-format.ts`

## Backend APIs used
- `GET/POST /api/finance/revenue`
- `GET/POST /api/finance/expenses`
- `PATCH /api/finance/expenses/[id]/approval`
- `POST /api/finance/expenses/[id]/petty-cash-spend`
- `GET/POST /api/finance/reconciliation`
- `GET /api/finance/reports`

## Navigation
Sidebar and mobile TopNav now show finance menu items only when `/api/me` returns a finance-capable user: `admin`, `accountant`, or `manager`.

## Verification notes
- Build completed successfully in Docker for UAT.
- Routes are protected by middleware and redirect anonymous users to `/uat/login`.
- With a session cookie present, the new protected pages render HTTP 200.
- Authenticated API smoke tests returned 200 for `/api/me`, revenue, expenses, reconciliation, and yearly reports.
