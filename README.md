# gdt-interface-demo

TypeScript library for reading and writing German **GDT** (Gerätedatenträger) exchange files: fixed-width `LLL` length prefix, four-digit field id (FK), payload, and `CRLF` line endings, typically interpreted as **latin1**.

A small **Svelte + Vite** demo (shadcn-svelte, Tailwind v4) talks to a local **Express** API for parse/serialise round-trips and shows an annotated line view for debugging device exports.

## Repository layout

| Path | Role |
|------|------|
| `src/` | Library: parser (`parser/line`, `parser/file`), `reader`, `writer`, types, barrel `index.ts` |
| `tests/` | Vitest unit + integration tests (round-trip, FK 8100 convergence) |
| `demo/` | Vite SPA (`demo/src`), Express API (`demo/server.ts`), production assets in `demo/dist/` |
| `dist/` | Compiled library output (`npm run build`) |

## Scripts (repository root)

| Command | Description |
|---------|-------------|
| `npm run build` | Emit `dist/` from `src/` (`tsc -p tsconfig.lib.json`) |
| `npm test` | Vitest |
| `npm run lint` | ESLint on `src/` and `tests/` |
| `npm run demo:dev` | Build library, then concurrently: `tsc --watch`, Vite dev (`demo/`), `tsx watch demo/server.ts` |
| `npm run demo:build` | Library build + Vite production build for `demo/` |
| `npm run demo:preview` | Serve `demo/dist` (default preview port; pass `--port` if needed) |

**Demo stack:** Vite proxies `/api` to `http://localhost:8787`. Override with `GDT_API_PORT`.

**Node:** Vite 6 and the demo toolchain target **Node 20+** (Vite 8 / newer Svelte plugins may require **20.19+**).

## Public API (overview)

- **`readGdt` / `readGdtFromString`** — Lenient or `strict` parse; patient convenience fields plus `rawFields` multi-map.
- **`writeGdt` / `stringifyGdt`** — Deterministic 6310/6311-style documents; **`injectDynamicFileLength`** converges FK **8100** byte length.
- **`buildGdtLine`, `splitLogicalRows`, `parseLogicalRow`** — Low-level line helpers.
- **`GDT_FIELD_IDS` / `lookupFieldLabel`** — FK constants and labels for UIs.

See TSDoc on exports in `src/`.

## Licence / naming

This sample is suitable for a neutral public repository (no employer-specific branding in code or docs).
