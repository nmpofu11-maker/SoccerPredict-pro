# Cloud Run football data provider secrets

The server-only provider clients read these environment variables:

| Cloud Run environment variable | Secret Manager secret |
| --- | --- |
| `API_FOOTBALL_USE_RAPIDAPI` | `API_FOOTBALL_USE_RAPIDAPI` |
| `SPORTMONKS_API_KEY` | `SPORTMONKS_API_KEY` |

No secret values belong in this repository, `.env.example`, browser code, or build-time Vite variables.

## Attach the existing secrets to a Cloud Run service

First confirm both secrets exist and identify the version you want to pin. Then replace
`SERVICE_NAME`, `REGION`, and `VERSION` below with your deployment's values:

```bash
gcloud run services update SERVICE_NAME \
  --region REGION \
  --update-secrets=API_FOOTBALL_USE_RAPIDAPI=API_FOOTBALL_USE_RAPIDAPI:VERSION,SPORTMONKS_API_KEY=SPORTMONKS_API_KEY:VERSION
```

The Cloud Run service identity needs Secret Manager Secret Accessor
(`roles/secretmanager.secretAccessor`) on both secrets. Pin a numbered secret
version for reproducible rollbacks rather than relying on `latest`.

Updating the service creates a new Cloud Run revision. This repository change
does not update Cloud Run or deploy a revision.

## Provider client scope

`src/services/serverFootballApis.ts` contains server-only request helpers for:
- API-Football fixtures by date, head-to-head, team statistics, and fixture statistics.
- Sportmonks fixtures by date and fixture statistics.

These helpers are a provider-access layer, not yet wired into fixture normalization,
prediction enrichment, or production ingestion. Provider coverage, plan entitlements,
and real API responses must be verified against the credentials and competitions
configured in the deployed project before enabling them in prediction calculations.
