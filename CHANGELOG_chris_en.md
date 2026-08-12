# Chris Fork Changelog

This file records feature, fix, and validation history for `chris-changes` relative to upstream Vibe-Research. It is not a fork usage guide. For the current feature overview, see [README_FORK_en.md](README_FORK_en.md).

## 2026-08-12 — Backend configuration and UI adjustments

### Editable backend configuration

- Added `backend/backend_config.json` to centralize A-share indices, global indices, and report-filename classification keywords.
- The backend reads and validates the configuration at startup. Invalid JSON, missing required fields, or empty keyword lists produce a clear error and prevent startup.
- A-share indices route through `tencent`, global indices through `eastmoney`, and report classification follows array order for precedence.
- Restart the backend after editing the configuration.

### UI / UX

- The Sector Center is marked as under construction. Sidebar child-sector shortcuts are expanded by default and have a separate collapse arrow that does not navigate.
- The `indices` list in `sectors.json` is explicitly future reference; Daily Review indices continue to come from the backend in real time.
- The portfolio page adds quote-loading feedback, filtering by name or code, defined sorting, internal scroll areas with sticky headers, and collapsed transaction entry/history sections by default.
- Holdings show up to 20 rows, while purchase and close histories show up to 10 rows before their respective table scroll areas are used.
- Amounts and prices retain four decimal places internally and display two. P&L excludes dividends, rights issues, and other corporate actions.

### Validation

- Frontend `npm.cmd test`: 16 tests passed.
- Frontend `npm.cmd run build`: passed.
- Configuration loading and source routing were checked offline. `backend/.venv` does not contain `pytest`, so added pytest cases were not executed in that environment.

## 2026-08-10 — Portfolio transaction ledger

- Portfolio positions are now driven by purchase and close transactions. Purchases increase the current position; closes reduce it at the then-current average cost and retain total-cost and realized-P&L snapshots.
- Purchase history stores name, date, execution price, shares, total cost, and currency. Close history stores proceeds, total cost, realized P&L, and P&L percentage.
- A close cannot exceed the current position. A fully closed position is removed from current holdings while both histories remain.
- Legacy aggregate holdings are automatically migrated into `Historical import` purchases without inventing an unknown buy date. Direct position/transaction deletion is not exposed, preserving ledger consistency.

## 2026-08-09 — Overseas securities, caching, and Intelligence Radar

### Overseas symbol format and data

- Stock Data accepts A shares as `300760`, US shares as `AAPL.US`, Hong Kong shares as `00700.HK`, and Korean shares as `005930.KR`; short HK codes are zero-padded.
- Bare symbols and the prior `.KS` suffix are no longer supported. Invalid formats return HTTP 400 with accepted examples.
- `gstock.py` constructs Eastmoney requests from country suffixes instead of using the non-working security-search endpoint. US symbols probe only bounded US market identifiers; HK and KR use deterministic mappings.
- The Stock Data page requests HK cash flow only for `.HK`; Korean shares remain quote-only without Eastmoney F10 metrics.

### Read-only stock-data cache

- Added an in-process TTL/LRU cache: maximum 64 entries, access-order updates, no caching of exceptions, and cleared on backend restart.
- The cache covers A-share data, valuation, reports, news, overseas aggregate quotes, and HK cash flow. Cache keys include result-affecting parameters such as report page count and news limit.

### Cross-market watchlist and portfolio support

- Watchlist and Daily Review watched securities support all four formats. A shares use batched Tencent quotes; overseas securities use Eastmoney one at a time.
- Live polling remains tied to A-share trading hours. Overseas securities update on initial load or manual refresh and use the 60-second overseas quote cache.
- Intelligence-page filings and individual-stock news automatically skip overseas watchlist entries because those endpoints support A shares only.
- Portfolio supports the same markets and reports market value, cost, unrealized P&L, and realized P&L separately for CNY, USD, HKD, and KRW without FX conversion.

### Intelligence Radar

- One AI call per track can generate Chinese digest bullets and Simplified-Chinese translations for non-Chinese headlines; headlines already containing Chinese are not translated.
- AI results are stored in `backend/.cache/radar.json` as track `digest` and item `zh`, and are reused when the page is reopened.
- **Save to notes** continues to save only the current digest to research notes; its original behavior is unchanged.
- Refresh creates a new `snapshot_id` and atomically replaces the cache. An AI write for an old snapshot is rejected with HTTP 409.
- After time ordering, RSS items are deduplicated by normalized title, ignoring case and extra whitespace while retaining the first source.

### Validation

- Frontend `npm.cmd test`: 16 tests passed; `npm.cmd run build`: passed.
- Backend checks covered `py_compile`, offline symbol routing/API format, TTL/LRU behavior, and radar cache/stale-snapshot/title-deduplication behavior.
- Read-only Eastmoney checks returned quotes for `AAPL.US`, `00700.HK`, and `005930.KR`, plus cash flow for `00700.HK`.
- `pytest` is not installed in `backend/.venv`, so added pytest cases were not executed there.
