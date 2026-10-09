# Cloud Run football data provider secrets

The server-only provider clients read these environment variables:

| Cloud Run environment variable | Secret Manager secret |
| --- | --- |
| `SPORTAPI_AI_KEY` | `SPORTAPI_AI_KEY` |
| `SPORTMONKS_API_KEY` | `SPORTMONKS_API_KEY` |
| `API_FOOTBALL_USE_RAPIDAPI` | `API_FOOTBALL_USE_RAPIDAPI` |

`SPORTAPI_AI_KEY` is the canonical environment variable read by the SportAPI.ai
client (the client also accepts the legacy `SPORTAPI_API_KEY` name). The
API-Football secret must contain the RapidAPI credential used for the
API-Football RapidAPI host. No secret values belong in this repository,
`.env.example`, browser code, or build-time Vite variables.

## Attach the existing secrets to a Cloud Run service

First confirm all three secrets exist and identify the version you want to pin. Then replace
`SERVICE_NAME`, `REGION`, and `VERSION` below with your deployment's values:

```bash
gcloud run services update SERVICE_NAME \
  --region REGION \
  --update-secrets=SPORTAPI_AI_KEY=SPORTAPI_AI_KEY:VERSION,SPORTMONKS_API_KEY=SPORTMONKS_API_KEY:VERSION,API_FOOTBALL_USE_RAPIDAPI=API_FOOTBALL_USE_RAPIDAPI:VERSION
```

The Cloud Run service identity needs Secret Manager Secret Accessor
(`roles/secretmanager.secretAccessor`) on all three secrets. Pin a numbered secret
version for reproducible rollbacks rather than relying on `latest`.

Updating the service creates a new Cloud Run revision. This repository change
does not update Cloud Run or deploy a revision.

## What the application now uses

`src/services/serverFootballApis.ts` contains server-only authenticated clients.
`src/services/serverFootballProviderEnrichment.ts` is connected to the daily
ingestion pipeline and:

- Queries API-Football fixtures for the requested South African local dates.
- Adds exact team/date matches from API-Football to existing provider fixtures.
- Enriches matched teams with API-Football current standings and the provider's
  recent W/D/L form when those endpoints return the required data.
- Retrieves actual API-Football head-to-head results for South African Premiership
  fixtures when the API returns completed records.
- Queries Sportmonks fixtures independently and adds genuinely new fixtures
  without replacing an existing provider's fixture record.
- Keeps missing stats unavailable. Possession, shots on target and xG are not
  fabricated when the configured plan/provider does not return them.

Football-Data.org enrichment remains enabled for competitions it supports. API
coverage depends on each provider's plan, season availability, and competition
coverage; successful authentication does not prove every competition is covered.

## Verification still required in the deployed project

The repository includes mocked client tests, but real provider calls require the
Cloud Run secrets and cannot be authenticated from a source-only repository
change. After attaching all required secrets, trigger the daily ingestion job and inspect
`/api/cron/status` (or the app's ingestion diagnostics) for each provider's
request counts, mapped fixtures and errors. A UI label of `CONNECTED`/`UNSET`
only reflects the runtime configuration check; it does not prove a successful
live API request. Confirm actual successful responses and mapped fixtures in
server-side diagnostics without logging or exposing secret values. Confirm Betway Premiership plus
international competitions separately before treating a provider as authoritative.
