# Chris Local Change Notes

This file records Chris-specific changes on this branch relative to upstream Vibe-Research. It does not replace the upstream `README.md`.

## 2026-08-09 — Intelligence Radar: AI digest, bilingual titles, and cache

### How to use it

1. Click **Refresh** in Intelligence Radar to fetch all RSS sources and create a new `backend/.cache/radar.json`.
2. Click **Let AI extract today's key points** for one track, or **Extract key points for all tracks**.
3. One AI call per track now returns both:
   - 3–5 Chinese digest bullets; and
   - Simplified-Chinese translations for every non-Chinese news title.

### Display and persistence

- English titles are displayed as the Chinese translation followed by the original English title. Titles that already contain Chinese are neither translated nor duplicated.
- Results are stored in `backend/.cache/radar.json`: `digest` on the track and `zh` on each news item.
- Reopening the browser or returning to Intelligence Radar reads this cache without another model call.
- **Save to notes** retains its existing behavior: it saves the current digest to research notes only.

### Refresh and concurrency protection

- Refresh remains a full refresh of all tracks and RSS sources. It atomically replaces `radar.json` with a new snapshot that has no old `digest` or `zh` fields.
- Every refresh creates a unique `snapshot_id`. If a refresh occurs while AI extraction is running, the stale result is rejected (HTTP 409), so it cannot overwrite the new news snapshot.

### RSS title deduplication

- After aggregation and time sorting, each track deduplicates news by normalized title, ignoring case and extra whitespace.
- Only the first source remains for a duplicated title. This takes effect for newly generated cache data after the next **Refresh**.

## 2026-08-09 — Stock Data: overseas symbol convention

### Input format

- China A shares remain six-digit numeric codes such as `300760` and continue through `astock.py`.
- US shares use `SYMBOL.US`, for example `AAPL.US`, `MSFT.US`, or `IBM.US`.
- Hong Kong shares use `CODE.HK`, for example `00700.HK`; the backend zero-pads codes shorter than five digits.
- Korean shares use `NNNNNN.KR`, for example `005930.KR`.

Bare codes such as `AAPL` or `00700`, and the old Korean suffix such as `005930.KS`, are no longer supported input formats. The backend returns HTTP 400 with the accepted examples.

### Backend resolution and scope

- `gstock.py` no longer depends on Eastmoney's non-working security search endpoint. It constructs quote requests directly from the country suffix.
- US symbols are tried only against the bounded set of US market identifiers maintained in code, stopping at the first match; no HK, KR, or A-share market identifier is probed.
- HK and KR symbols each use one deterministic Eastmoney market identifier. If Eastmoney changes the internal mapping, only `_COUNTRY_MARKETS` in `backend/gstock.py` needs maintenance.
- The frontend requests Hong Kong cash flow only for `.HK` inputs. US and Korean lookups no longer make a cash-flow request that must fail. Korean shares continue to provide quotes only, without Eastmoney F10 metrics.

## 2026-08-09 — Stock Data: backend TTL/LRU cache

- Stock-query cache lives only in the running backend process; it is neither written to the browser nor to disk, and is cleared when the backend restarts.
- Each read first checks the cache. The same endpoint, symbol, and result-affecting parameters return the in-memory result within the TTL without contacting the remote source. Failed requests are not cached.
- The cache is capped at 64 entries and evicts the least recently used entry (LRU) when full, preventing unbounded memory growth.
- Existing A-share caches are unified with newly cached primary valuation (60 seconds), reports (30 minutes), news (10 minutes), overseas quote/metrics (60 seconds), and Hong Kong cash flow (12 hours).
- Cache keys include result-affecting parameters, such as report page count and news limit, so different query variants cannot share a result incorrectly.

## 2026-08-09 — Watchlist: overseas securities

- The watchlist now supports China A shares as `300760`, US shares as `AAPL.US`, Hong Kong shares as `00700.HK`, and Korean shares as `005930.KR`, matching the Stock Data convention. Hong Kong codes shorter than five digits are zero-padded.
- The watchlist remains in browser `localStorage`. A shares use the Tencent A-share quote endpoint in batch; overseas securities use the existing Eastmoney overseas quote endpoint one at a time.
- Both the Watchlist page and Daily Review's watched-security overview support these markets. The live toggle still polls during A-share trading hours; overseas securities load initially or on manual refresh and are subject to the backend's 60-second overseas-quote cache.
- The Intelligence page's A-share filings and individual-news aggregation automatically skips overseas watchlist entries, so it does not send them to A-share-only endpoints.
- The watchlist input is now one line. Spaces, commas, semicolons, and pasted line breaks all delimit multiple securities.

## 2026-08-09 — Portfolio: transaction ledger, overseas securities, and currency-separated totals

- The portfolio is now driven by **purchase transactions** and **closed-position transactions**. A purchase increases the current position; a close reduces it at the then-current average cost and saves a fixed total-cost and realized-P&L snapshot.
- Purchase history includes name, buy date, execution price, shares, total cost, and currency. Closed-position history includes name, close date, execution price, shares, total proceeds, total cost, realized P&L, P&L percentage, and currency. History does not change with later quotes or transactions.
- **Add holding record** and **Add closed-position record** accept `300760`, `AAPL.US`, `00700.HK`, and `005930.KR`; currency is inferred from the code. A close cannot exceed the current position. A fully closed position disappears from current holdings while both histories remain.
- A legacy aggregate holding is automatically converted to one `Historical import` purchase record without inventing an unknown buy date. Direct deletion of positions or transactions is not exposed, preserving ledger consistency.
- Current holdings retain submitted shares, average cost, and total cost; only quote, market value, unrealized P&L, and P&L percentage are live. A shares use Tencent batch quotes; overseas holdings use lightweight Eastmoney quotes.
- Market value, cost, unrealized P&L, P&L percentage, and the new realized-P&L card are separated by currency with no FX conversion. Profit is green and loss is bold red.
- Unit prices and amounts are calculated and saved to local JSON with four decimal places; the page displays two decimal places.
- The page explicitly states that P&L is buy/sell price-difference P&L only and excludes dividends, rights issues, and other corporate actions. The three tables appear only when populated: holdings sort by market value descending, and purchase/close history sort by date descending; every table supports name-keyword filtering.
- Holdings show up to 20 rows and purchase/close histories up to 10 rows before their internal scroll area is used. Purchase/close history and both transaction-entry panels are collapsed by default and expand with their arrow button.
- Each table's name filter performs a case-insensitive contains match independently against both the company name and the security code, so a complete value or a fragment of either field works. Column headers remain fixed at the top of their own scroll area while table rows scroll.
- While portfolio quotes are loading on initial entry, automatic refresh, or manual refresh, the page header shows a spinner and a `行情数据访问中...` status; it disappears after success or failure.

### Validation

- Frontend `npm.cmd test`: 16 tests passed.
- Frontend `npm.cmd run build`: passed.
- Backend: `py_compile`, offline symbol-routing simulations, and the API 400 format check passed; read-only Eastmoney checks returned quotes for `AAPL.US`, `00700.HK`, and `005930.KR`, plus cash-flow data for `00700.HK`.
- Backend: offline TTL/LRU checks passed for hits, expiry, non-caching of errors, 64-entry eviction, parameter isolation, and normalized overseas-symbol cache keys.
- Frontend: the overseas-watchlist adaptation passed the TypeScript production build and the existing 16 tests.
- Backend offline checks passed for syntax, cache persistence, stale snapshot rejection, refresh clearing, and title deduplication.
- `pytest` is not installed in `backend/.venv`, so the added pytest tests have not been run there.

## 2026-08-12 — Editable backend configuration

- `backend/backend_config.json` centralizes three non-personal settings. Each `a_share_indices` and `global_indices` entry contains a stable `key`, display name, source request identifier (`secid`), region, and `source`; A-shares use `tencent` and global indices use `eastmoney`. `report_industry_keywords` defines report-filename categories and keywords.
- The backend reads and validates this file at startup. Invalid JSON, missing required fields, or empty keyword lists produce a clear startup error instead of silently using an incorrect configuration.
- Restart the backend after editing. Report classification evaluates `report_industry_keywords` in array order, so earlier categories take precedence.

## 2026-08-12 — Sector center navigation notice

- The right-side sector-center page title is now `板块中心 (建设中)`. The sidebar remains simply `板块中心` and has a separate arrow for expanding or collapsing its shortcut child sectors; it is expanded by default, and the arrow does not navigate.
- The `indices` list in `frontend/src/data/sectors.json` is retained only as future reference and is not connected to a page or API. Daily Review indices continue to be obtained from the backend in real time.
