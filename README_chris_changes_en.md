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

## 2026-08-09 — Portfolio: overseas securities and currency-separated totals

- **Add holding** and **Add closed position** now accept the same formats as Stock Data: `300760`, `AAPL.US`, `00700.HK`, and `005930.KR`. Short HK codes are zero-padded. Existing local A-share records need no migration and are inferred as `CNY`.
- Holding and closed-position tables now include a currency column: `CNY` for A shares, `USD` for US shares, `HKD` for Hong Kong shares, and `KRW` for Korean shares. Amounts remain in their native currency; no FX conversion is performed.
- Market value, cost, unrealized P&L, P&L percentage, and realized P&L are displayed separately for every present currency. Different currencies are never summed together.
- A-share holdings continue to use Tencent batch quotes. Overseas holdings use the lightweight Eastmoney overseas quote path, which obtains only name and quote data without an extra financial-metrics request.
- Profit is green; loss is bold red; zero is neutral grey. The AI reading context also explicitly labels every amount and total with its currency.

### Validation

- Frontend `npm.cmd test`: 16 tests passed.
- Frontend `npm.cmd run build`: passed.
- Backend: `py_compile`, offline symbol-routing simulations, and the API 400 format check passed; read-only Eastmoney checks returned quotes for `AAPL.US`, `00700.HK`, and `005930.KR`, plus cash-flow data for `00700.HK`.
- Backend: offline TTL/LRU checks passed for hits, expiry, non-caching of errors, 64-entry eviction, parameter isolation, and normalized overseas-symbol cache keys.
- Frontend: the overseas-watchlist adaptation passed the TypeScript production build and the existing 16 tests.
- Backend offline checks passed for syntax, cache persistence, stale snapshot rejection, refresh clearing, and title deduplication.
- `pytest` is not installed in `backend/.venv`, so the added pytest tests have not been run there.
