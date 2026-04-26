# Oda private snapshot importer

This importer is a manual one-time developer script for FuelForm.

It is **not** run by the mobile app and **not** run automatically in production.

## What it does

- Discovers product URLs from `https://oda.com/sitemap.xml` (including nested sitemaps).
- Extracts Oda product IDs from `/no/products/{id}-{slug}/` URLs.
- Fetches each product from `https://oda.com/api/v1/products/{id}/` with:
  - user agent: `FuelForm-private-import-bot/1.0`
  - delay between requests
  - exponential backoff
  - `Retry-After` support
  - automatic stop if too many `429`, `401`, `403`, or `5xx` responses
- Normalizes nutrition values per 100g/ml.
- Upserts into Supabase `public.food_items` with dedupe.

## Required environment variables

Set these in local `.env` (never commit secrets):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The script also accepts `EXPO_PUBLIC_SUPABASE_URL` as URL fallback.

## Commands

Dry-run sample:

```bash
npm run import:oda-foods -- --sample=5 --dry-run
```

Dry-run with limit:

```bash
npm run import:oda-foods -- --limit=20 --dry-run
```

Small real import:

```bash
npm run import:oda-foods -- --limit=20
```

Larger real import:

```bash
npm run import:oda-foods -- --limit=500
```

Import all (removes hard safety cap):

```bash
npm run import:oda-foods -- --all
```

Import one specific product:

```bash
npm run import:oda-foods -- --only-product-id=36715 --dry-run
```

Resume from previous run:

```bash
npm run import:oda-foods -- --resume
```

## Resume and failure files

The script writes local state files under:

- `scripts/oda-import/.cache/discovered-products.json`
- `scripts/oda-import/.cache/sample-response-structure.json`
- `scripts/oda-import/.cache/import-progress.json`
- `scripts/oda-import/.cache/failed-imports.jsonl`

When `--resume` is used, already processed products are skipped.

## Data restrictions

Importer only stores nutrition-related factual data needed for food logging.

It does **not** store product images, prices, campaign text, reviews, or availability fields.
