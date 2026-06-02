# OpenPayments Viz

Monorepo (npm workspaces) for visualizing Open Payments flows.

## Packages in this repo

- `packages/shared`: Flow DSL + event schema types
- `apps/runner`: local Node runner (HTTP + SSE) that executes the Open Payments flow and streams events

## Run the runner

```bash
npm install
npm run build
npm run dev
```

Runner defaults to `http://localhost:3344`.

