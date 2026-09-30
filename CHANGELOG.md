# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Security
- Server-side URL scraping now rejects non-public destinations for IPv4 **and** IPv6
  (loopback, private, link-local, unique-local, carrier-grade NAT, multicast, IPv4-mapped IPv6).
  Hostnames are checked at connect time through a custom DNS lookup, so a public-looking name that
  resolves to a private address, or rebinds between check and use, is refused.
- Scrape URLs may no longer contain credentials or use ports other than 80/443.
- This replaces the string-prefix blocklist from `bb350c5`, whose IPv6 checks never ran because
  `URL.hostname` keeps the brackets around IPv6 literals (`[::1]`), so `isIP()` returned 0.

### Fixed
- TheRundown rate limiting: requests are spaced by `THERUNDOWN_REQUEST_SPACING_MS` (default 1100 ms),
  a 429 is retried once, and a persistent 429 stops the batch with a single warning that states how
  many leagues were skipped. Rate limiting is detected by error type, not by searching message text
  for "429", so an unrelated error that mentions 429 no longer aborts the batch.
- Missing accuracy figures render as "n/a" instead of a fabricated "0.0%" (calibration tab, sidebar,
  yesterday's results) and the navbar no longer falls back to a hardcoded "76.7% Accuracy".

### Changed
- Removed an unsupported "86.0% to 76.7%" ablation claim from the statistical analysis modal.

### Added
- Out-of-sample prediction log (`src/services/predictionLog.ts`). Every 30 minutes the server freezes a
  prediction for each upcoming fixture (kickoff within `PREDICTION_HORIZON_HOURS`, default 72) into an
  append-only, hash-chained file (`data/prediction-log.jsonl`, override with `PREDICTION_LOG_PATH`).
  A prediction is accepted only strictly before kickoff and only once per fixture; it is never updated.
  Real results are copied in after settlement, and the outcome is derived from the recorded scores.
  `GET /api/predictions/track-record` and `npm run track-record` report accuracy (with a 95% interval),
  Brier score, and the always-home and most-common-outcome baselines on logged predictions only.
  Figures are withheld (`null`/"not reportable") until `PREDICTION_MIN_SAMPLE` (default 30) predictions
  are scored. `verifyLog()` flags edited, deleted or reordered lines. This is tamper-evident, not
  tamper-proof: record the head hash outside the server, and keep the log on persistent storage.
- `npm test` (Node test runner via `tsx`), also run in CI. It checks that the rules engine never
  references odds data, that predictions are unchanged when odds are attached to a fixture, that the
  URL filter blocks private/loopback/mapped addresses, that no hardcoded headline accuracy figure
  exists in `src`, that any committed learning state is untrained with auto-learning off, and the
  TheRundown rate-limit behaviour above.

## [1.0.0-repaired] - 2026-09-30

Remediation release following an audit of the learning-state, data-provenance and security issues
listed under "Background" below. Covers commits `e4c5d07` through `301e88a` (2026-09-29 to 2026-09-30).

### Background
- Commit `44d089b` was titled "integrate odds-based heuristic". The diff is a performance refactor
  of the accumulator engine; the prediction rules engine contains no odds references at any revision.
  Odds are used only downstream, to compare model probabilities against bookmaker prices.
- Commit `c4af7ea` reintroduced a stale pre-audit learning state (auto-learning on, thousands of
  epochs, five weight keys missing). It was caused by a client auto-learning loop writing an
  out-of-date in-memory state back through an unauthenticated endpoint, combined with a stale
  server-side weight dictionary that dropped keys on every write.

### Security
- All mutating API routes now require an operator key (`ADMIN_API_KEY`, sent as `x-admin-api-key`).
  The server fails closed (503) when the key is not configured and compares keys in constant time.
- `POST /api/learning-state` is server-authoritative: writes that raise the epoch count past the
  on-disk value are rejected (409) unless the operator starts the server with
  `ALLOW_LEARNING_TRAINING=1`. Identical-weight saves are accepted; material changes are snapshotted
  to `data/backups/prewrite_*` first, and state is written atomically.
- The learning-state restore route sanitizes weights, forces auto-learning off, and snapshots first.
- Server-side URL scraping validates the URL, blocks obvious private hostnames and IPv4 ranges, and
  no longer follows redirects. Uploaded fixture files are cleaned up; manual fixtures are validated.
- Multipart uploads are limited to one file of at most 10 MB.

### Learning and evaluation
- Client-side learning controls and the dead auto-learning path were removed; client training can no
  longer overwrite server state.
- The server weight dictionary was restored to the full 25-key set so no weights are stripped on write.
- Model evaluation, ablation and dashboard metrics now use a fixed chronological holdout with
  baselines grounded in pre-holdout data. Legacy persisted learning state and telemetry are
  invalidated on load, and the bundled persisted learning-state file was removed from the repository.
- Removed unverifiable or fabricated learning metrics, "super-learning"/"unbounded calibration"
  terminology, "optimal" status labels, and calibrated-confidence wording. Certainty is now described
  as the leading probability, and accumulator scoring is labelled a heuristic evidence score.

### Data integrity
- Missing measurements (team stats, form, standings points, head-to-head, tactical metrics, kickoff
  times) are represented as unavailable (`null`/"N/A") instead of being replaced with synthetic
  defaults, in both the server providers (SportAPI.ai, TheRundown) and the UI.
- Removed fabricated prediction fallbacks, fake initial scrape telemetry, vacuous perfect audit
  metrics, and unperformed-scrape timestamps. Live events without a valid kickoff are rejected.
- Dates use the application-local calendar; the hardcoded fixture date cutoff was removed. Empty
  authoritative slates are respected.
- Smart accumulator: negative-EV selections are excluded; empty cohorts report "no value" instead of
  placeholder numbers; top selections stay within the next 12 hours.
- Provenance and authenticity labels are now factual; bundled standings are labelled as reference data.

### Build and CI
- CI runs the TypeScript check and production build on Node 22.
- Historical-evaluation types and UI labels renamed to avoid "backtest" ambiguity.

### Known limitations
- `src/data/historical_results.ts` holds 82 entries. The 27 `hist_18sept_*` entries were generated by
  `scripts/build_historical_results.cjs` with hash-derived league ranks and identical placeholder
  team statistics; only their scores are real. Do not treat accuracy on this set as evidence of
  predictive skill. Provenance of `hist_001`-`hist_055` has not been independently verified.
- No out-of-sample track record exists yet. Log predictions against real results before relying on
  any accuracy figure.
- The server listens on `0.0.0.0`, and the operator key is entered through a browser prompt and kept
  in `sessionStorage`.
- Some source comments still say "Aggressive Super-Learning Protocol".

## Earlier history
- `1.0.0` initial entry listed the technology stack only: React 19, Vite, Express, Capacitor
  (Android), Google GenAI, Tailwind CSS 4, PDF parsing, Recharts, node-cron.
