# Vibe-Research — Chris Fork

## About This Fork

This is a personal fork of [simonlin1212/Vibe-Research](https://github.com/simonlin1212/Vibe-Research), which is maintained by Simon Lin.

The fork contains fixes, enhancements, and experimental features developed while installing, running, and using the project. It is not an official Vibe-Research release. The upstream project remains the source of truth for supported behavior, compatibility commitments, and releases.

## Main Differences from Upstream

- **Overseas securities:** Stock Data, Watchlist, and Portfolio accept A shares as `300760`, US shares as `AAPL.US`, Hong Kong shares as `00700.HK`, and Korean shares as `005930.KR`. Short HK codes are zero-padded; filings and individual-stock news remain A-share-only.
- **Stock-data caching:** Multiple read-only stock endpoints use an in-process TTL/LRU cache to reduce duplicate remote requests. The cache is not persisted and is cleared when the backend restarts.
- **Intelligence Radar:** AI-generated track digests and Simplified-Chinese translations for non-Chinese headlines can be saved. Refresh snapshots prevent stale AI output from overwriting newer RSS data, and normalized titles are deduplicated.
- **Portfolio ledger:** Current holdings are driven by purchase and close transactions, with retained history and realized-P&L snapshots. Multiple markets are supported and totals are separated by native currency without FX conversion.
- **Backend configuration:** `backend/backend_config.json` centralizes A-share/global index definitions and report-filename classification keywords. Restart the backend after editing; invalid configuration prevents startup.
- **UI and workflow adjustments:** The portfolio page adds filtering, sorting, collapsible history, and loading feedback. The Sector Center displays its build status and its sidebar child sectors can be collapsed.

Some of these differences are experimental design choices and may not be suitable for upstream contribution. See the changelog for detail.

## Branches

- `main`: kept as close as practical to upstream.
- `chris-changes`: the currently maintained and used fork branch.

## Installation and Usage

For general installation, startup, and usage instructions, see [README_en.md](README_en.md). Fork-specific notes:

- Use the country-suffixed overseas symbol formats above; bare symbols and the former `.KS` suffix are not supported.
- Restart the backend after editing `backend/backend_config.json`.
- Portfolio, reports, and other user data are stored in the user data directory by default; do not commit local data files to Git.

## Change History

See [CHANGELOG_chris_en.md](CHANGELOG_chris_en.md) for the complete history.

## Upstream and License

This fork is based on [simonlin1212/Vibe-Research](https://github.com/simonlin1212/Vibe-Research). It retains the upstream MIT License, copyright, and attribution; see [LICENSE](LICENSE). This fork does not modify the upstream license.
