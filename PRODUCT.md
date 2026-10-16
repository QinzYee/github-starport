# GitHub Hot Projects

<!-- impeccable:product-schema 1 -->

## Platform
Chinese web UI with a public static portal and optional Windows local helper. The public site works without installation; the helper enables Git cloning into a user-selected local directory. Existing Node local mode and legacy cloud ZIP mode remain available.

## Stack
Node.js local service and browser UI, delegated to the implementer and confirmed by the user. Public distribution uses static assets on Cloudflare; GitHub Actions generates timestamped JSON snapshots. No database or always-on public server is required. Optional Windows helper carries production dependencies and installs its own verified Node.js runtime.

## Purpose
Find interesting GitHub repositories using daily, weekly and monthly Star growth, plus an all-time Star leaderboard. Without installation, users browse/filter/select, open original source ZIP downloads, copy Git commands and export a repository list. Installing the helper unlocks Git cloning, history, directory choice, progress and retries. The helper import only carries repository names and never begins a download automatically.

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
