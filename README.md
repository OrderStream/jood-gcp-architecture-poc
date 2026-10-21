# Jood — Production BI / Market Intelligence Engine on GCP (Architecture POC)

Architectural proof-of-concept demonstrating the transition of the Jood office-furniture market intelligence system from an initial local prototype to a production-grade GCP stack.

---

## Architecture Overview

```
[ External Clearance Sources ] 
            │ (Puppeteer Scrapers / APIs)
            ▼
┌──────────────────────────────────────────────┐
│       TypeScript Extensible Connector        │
│       • BaseConnector abstraction            │
│       • Deterministic SHA-256 content hash   │
└──────────────────────┬───────────────────────┘
                       │
       ┌───────────────┴───────────────┐
       ▼                               ▼
┌────────────────────────┐   ┌────────────────────────┐
│ Vertex AI (Gemini 1.5) │   │ Cloud SQL (PostgreSQL) │
│ • JSON Schema filter   │   │ • Deduplicated lots    │
│ • Parity benchmark     │   │ • Append-only history  │
└────────────────────────┘   └────────────────────────┘
```

---

## Key Modules

### 1. `schema.sql` (PostgreSQL / Cloud SQL)
- **Content-Hash Deduplication:** Computes deterministic SHA-256 payload hashes (`content_hash`) to ensure idempotent ingestion. Re-running any connector will not duplicate records or cause state pollution.
- **Append-Only Price History (`furniture_price_history`):** Logs every historical price, discount, and tier change over time for longitudinal market trend analytics.
- **Upsert Stored Procedure (`upsert_furniture_lot`):** Executes zero-write no-ops when payloads have not changed.

### 2. `connector.ts` (Extensible TypeScript Source Layer)
- **`BaseConnector<TRaw>`:** Abstract ingestion pattern separating data retrieval (`fetch()`) from normalization (`parse()`).
- **Zero-Refactor Scaling:** Adding new international stock/clearance platforms requires only implementing an isolated parser class without touching core pipeline logic.

### 3. `vertex_gemini.ts` (Vertex AI Migration & Parity Benchmark)
- **Structured JSON Schema (`responseSchema`):** Enforces strict JSON output typing from Gemini 1.5 Flash (`is_office_furniture`, `category`, `confidence`, `clearance_tier_recommendation`), keeping inference cost to fractions of a cent.
- **Quality Parity Benchmark (`runQualityParityBenchmark`):** Quantitative evaluation harness to evaluate precision, recall, and agreement rates against the legacy local Ollama baseline before deprecating it.

---

## Production Deployment & Revision Hygiene (Cloud Run)

In production, scrapers and connectors are containerized as stateless Cloud Run jobs triggered via Cloud Scheduler.

To guarantee zero regression and protect staging routes, all deployments enforce explicit revision tagging:
```bash
gcloud run deploy jood-scraper-service \
  --image gcr.io/${PROJECT_ID}/jood-scraper:latest \
  --tag staging \
  --no-traffic \
  --region europe-west1
```

---

## Workflow & Communication

- **Delivery:** 100% Asynchronous, PR-driven workflow.
- **Quality Assurance:** Every milestone is delivered as a reviewed GitHub PR with automated unit tests and verification runbooks.
