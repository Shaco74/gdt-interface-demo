# GDT Demo (Frontend)

Svelte-Oberfläche zum **gdt-interface-demo**-Paket: Roh‑GDT bearbeiten, über **`/api/read`** und **`/api/write`** (Express) parsen/serialisieren, Patientenfelder und annotierte Zeilen anzeigen.

## Stack

| Technologie | Rolle |
|-------------|--------|
| **Svelte 5** | UI (`$state`, `$derived`, …) |
| **Vite 6** | Dev-Server, Build, Proxy für `/api` |
| **TypeScript** | `npm run check` (svelte-check + `tsc`) |
| **Tailwind CSS v4** | Styling (`@tailwindcss/vite`, `src/app.css`) |
| **shadcn-svelte** (bits-ui) | UI-Bausteine unter `$lib/components/ui/` |
| **@lucide/svelte** | Icons (z. B. Loader, Upload) |

## Verzeichnisstruktur

```text
demo/
├── server.ts              # Express: /api/read, /api/write, /api/health (Port 8787)
├── vite.config.ts         # $lib-Alias, Tailwind-Plugin, /api → localhost:8787
├── package.json
├── index.html
└── src/
    ├── main.ts            # Mount der App
    ├── app.css            # Tailwind / Design-Tokens
    ├── App.svelte         # gesamte Demo-UI (eine Seite)
    ├── assets/            # statische Assets (Vite-Defaults)
    └── lib/
        ├── utils.ts       # cn() & Hilfen (shadcn)
        ├── trainingSampleLatin1.ts   # Muster‑GDT (latin1), ohne fs im Bundle
        └── components/
            └── ui/        # shadcn-svelte Komponenten (pro Komponente Ordner)
                ├── badge/
                ├── button/
                ├── card/
                ├── scroll-area/
                ├── separator/
                ├── skeleton/
                ├── tabs/
                └── textarea/
```

**Alias:** `$lib` → `src/lib` (siehe `vite.config.ts`).

## UI-Komponenten (`$lib/components/ui/`)

Jeder Ordner enthält typischerweise die **`.svelte`‑Datei(en)** und ein **`index.ts`** für Re-Exports (shadcn-Konvention).

| Ordner | Verwendung in `App.svelte` |
|--------|-----------------------------|
| `button` | Aktionen (Parsen, Serialisieren, Datei, Muster) |
| `card` | Karten für Patient, Roh‑GDT, Befunde, annotierte Tabelle |
| `badge` | z. B. geparstes Geschlecht |
| `textarea` | Roh‑GDT, Befundtext |
| `scroll-area` | scrollbare annotierte Datensatz-Tabelle |
| `skeleton` | Ladezustände in der Tabelle |
| `tabs`, `separator` | im Repo vorhanden; aktuell **nicht** in `App.svelte` eingebunden |

Neue shadcn-Komponenten landen unter demselben Muster in `src/lib/components/ui/<name>/`.

## Seitenaufbau (`App.svelte`)

Grober vertikaler Ablauf:

1. **Header** — Titel und Kurzbeschreibung  
2. **Aktionsleiste** — „Serialisieren & zurücklesen“, „Nur Parsen“  
3. **Fehlermeldung** (bei API-Fehlern)  
4. **Zwei Spalten** (`lg:grid-cols-2`) — **Patientendaten** (Card) \| **Roh‑GDT** (Upload, Strict-Checkbox, Textarea)  
5. **Befunde** — volle Breite, FK 6228  
6. **Annotierter Datensatz** — volle Breite, clientseitig mit `splitLogicalRows` / `parseLogicalRow` (lenient)

Die App importiert die **Bibliothek** relativ aus dem Repo: `../../src/types/fields.js`, `../../src/parser/line.js` (nur im Dev mit erlaubtem `server.fs.allow`).

## API während der Entwicklung

Vite leitet **`/api/*`** an **`http://localhost:8787`** weiter (`vite.config.ts`). Den Express-Server startest du aus dem **Repo-Root** mit:

```bash
npm run demo:dev
```

Das baut die Library, startet **`tsx watch demo/server.ts`** und den Vite-Dev-Server für `demo/`. Nur `npm run dev` **innerhalb von `demo/`** reicht nicht für `/api`, solange `server.ts` nicht separat läuft.

Port des API-Servers: Umgebungsvariable **`GDT_API_PORT`** (Standard **8787**).

## Scripts (in `demo/`)

| Befehl | Beschreibung |
|--------|----------------|
| `npm run dev` | Vite Dev-Server (mit Proxy, wenn API läuft) |
| `npm run build` | Production-Build → `demo/dist/` |
| `npm run preview` | Vorschau des Builds |
| `npm run check` | `svelte-check` + TypeScript für App und Node-Konfig |

## IDE

VS Code + [Svelte for VS Code](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) ist weiterhin eine sinnvolle Kombination.
