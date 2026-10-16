# GitHub Hot Projects

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
Node.js local service and browser UI, delegated to the implementer and confirmed by the user. Public distribution uses static assets on Cloudflare; GitHub Actions generates timestamped JSON snapshots. No database or always-on public server is required. The public website has no helper, protocol registration or local network detection.

## Purpose
Find GitHub repositories by daily, weekly and monthly Star growth, plus cumulative Stars. Public users select repositories, download original source ZIPs and copy full-history Git clone commands. An optional directory is used only to generate commands; ZIPs use browser download settings. Each page has 10 rows; daily is capped at 10, weekly 20, monthly and all-time 50. Trending shows fewer repositories when the source has fewer candidates.

## Confirmed behavior
- Daily, weekly and monthly lists use period Star growth; all-time uses cumulative Stars.
- Explain that Trending is a candidate list, not an exhaustive global Star-growth ranking.
- Use real upstream data and visibly disclose stale cached data or failures.
- Reuse suitable open-source code with attribution and retained license.
- A compact repository list and persistent selection/download panel were proposed and accepted.
- Git clones must not overwrite existing directories. Repository contents are downloaded, never executed.
- Cloud mode must not pretend to have local capabilities: directory picking, cloning to the visitor's disk and opening folders are refused with 403 instead of being simulated. Downloads become one ZIP streamed to the browser, with per-repository success or failure reported.

## Open decisions
Product name is an implementation placeholder. LLM assistance is optional only if it solves a concrete problem; deterministic fetching/ranking/cloning does not require a model.
