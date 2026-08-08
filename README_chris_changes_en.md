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

### Validation

- Frontend `npm.cmd test`: 16 tests passed.
- Frontend `npm.cmd run build`: passed.
- Backend offline checks passed for syntax, cache persistence, stale snapshot rejection, refresh clearing, and title deduplication.
- `pytest` is not installed in `backend/.venv`, so the added pytest tests have not been run there.
