# Staff reports update

## Scope
- Existing cashier.html, shared catalog and database retained. No production orders, inventory or money modified by tests.
- Staff navigation: Касса / Заказы / Выручка; owner management under Ещё.
- Saved-order inline notice with exact-order link; mobile wrapping and safe-area spacing. Cart quantities reset immediately after successful save.
- Authorized GET /api/staff-report returns server-filtered orders or paid-order revenue, full-period aggregates and keyset pages of 50.
- Moscow calendar dates; today, yesterday, trailing 7/30 calendar days, inclusive custom dates, all time. Creation time for orders; immutable confirmed paidAt for revenue.
- Cursor fixes a time boundary and processing rank using processedAt. Payment and processing updates are conditional/idempotent. Existing stock/order transaction retained.
- Selection retained in memory across sections; request-generation checks discard stale responses. Date changes clear old totals while loading.

## Verification
- node verify-api.mjs: isolated SQLite, fake Telegram signatures/transport only. Covers original ordering/stock/access/delivery/STOP/notifications and new report boundary, range, role, payment and pagination tests.
- Report tests: 124 payments across multiple pages; totals include all rows, equal cash+card; yesterday-created/today-paid; unpaid/cancelled exclusion; processing between pages; concurrent payment preserves original timestamp and counts once.
- TypeScript and frontend syntax checks passed.
- Browser fixture at 320 and 390 px: no horizontal overflow, 46 px navigation buttons, saved notice fits, link opens exact saved order; custom dates work; selection retained across tabs; delayed previous response discarded; quantity UI resets after save.
- Temporary public fixtures removed before publication.

## Limitations / handover
- Actual staff-bot Menu Button / Main Mini App URL cannot be read without bot access. Expected service entry is /cashier.html on this project's existing domain; /manage.html redirects there. Do not diagnose caching without verifying bot configuration.
- Physical Telegram iPhone/Android execution and safe areas still require device acceptance testing. Browser fixtures do not prove native Telegram behavior.
- Telegram notifications remain dependent on missing server bot/chat configuration; no real notification delivery was asserted.
- No fiscalization. No newly invented cancellation/refund operation; existing cancelled-order exclusion retained. Historic paid records without paidAt cannot be assigned a truthful payment date automatically and are not counted in date-based revenue.
- Existing photos, menu, prices, stock and customer UI unchanged in this update.
