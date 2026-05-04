<script lang="ts">
  import { onMount } from "svelte";

  import { lookupFieldLabel } from "../../src/types/fields.js";
  import { splitLogicalRows, parseLogicalRow } from "../../src/parser/line.js";
  import { TRAINING_SAMPLE_LATIN1 } from "$lib/trainingSampleLatin1.js";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import UploadIcon from "@lucide/svelte/icons/upload";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card/index.js";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import Textarea from "$lib/components/ui/textarea/textarea.svelte";

  /** Einzeilige Felder: kompakt, ohne Textarea-Mindesthöhe. */
  const fieldOneLineClass =
    "border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-sm outline-none transition-[color,box-shadow] focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50";

  type GdtGender = "male" | "female" | "unknown";

  type ApiPatient = {
    patientId: string;
    firstName: string;
    lastName: string;
    birthDate: string | null;
    gender: GdtGender;
    rawFields: Record<string, string[]>;
  };

  type AnnotatedLine = {
    lineNumber: number;
    fieldId: string;
    label: string;
    declaredLength: number;
    payloadPreview: string;
    parseIssue?: string;
  };

  function sampleTrainingLatin1(): string {
    return TRAINING_SAMPLE_LATIN1;
  }

  function isoDayToDdMmYyyy(iso: string): string | null {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return null;
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = String(d.getUTCFullYear()).padStart(4, "0");
    return `${dd}${mm}${yyyy}`;
  }

  function genderGenderToCode(value: GdtGender): "" | "1" | "2" {
    if (value === "male") return "1";
    if (value === "female") return "2";
    return "";
  }

  function annotateDocument(gdtLatin1: string): AnnotatedLine[] {
    const rows = splitLogicalRows(gdtLatin1);
    const out: AnnotatedLine[] = [];
    for (let i = 0; i < rows.length; i++) {
      const idx = i + 1;
      try {
        const parsedRow = parseLogicalRow(rows[i]!, false);
        const preview =
          parsedRow.content.length > 120
            ? `${parsedRow.content.slice(0, 117)}…`
            : parsedRow.content;
        out.push({
          lineNumber: idx,
          fieldId: parsedRow.fieldId,
          label: lookupFieldLabel(parsedRow.fieldId),
          declaredLength: parsedRow.declaredTotalLength,
          payloadPreview: preview,
        });
      } catch {
        out.push({
          lineNumber: idx,
          fieldId: "????",
          label: "Konnte nicht gelesen werden",
          declaredLength: 0,
          payloadPreview: rows[i]?.slice(0, 140) ?? "",
          parseIssue:
            "Zeilenrahmen entspricht keiner erwarteten LLL+FK+Inhalt‑Struktur.",
        });
      }
    }
    return out;
  }

  let rawLatin1 = $state(sampleTrainingLatin1());
  let strictMode = $state(false);

  let loading = $state(false);
  let errorMessage = $state<string | null>(null);

  let patientIdInput = $state("2");
  let firstNameInput = $state("Hans");
  let lastNameInput = $state("Mustermann");
  let birthDdMmYyyy = $state("01011977");
  let genderWrite = $state<"" | "1" | "2">("1");
  let befundeInput = $state(
    "Sinusrhythmus, normale PQ-Zeit, keine Hochspannungszeichen.\nZweite Zeile: Verlauf unauffällig.",
  );

  type ParsedSnapshot = ApiPatient | undefined;

  let lastParsedApi = $state<ParsedSnapshot>(undefined);

  let fileInputEl = $state<HTMLInputElement | null>(null);

  const annotatedLines = $derived.by(() => annotateDocument(rawLatin1));

  function applyParsedToEditors(data: ApiPatient): void {
    patientIdInput = data.patientId ?? "";
    firstNameInput = data.firstName ?? "";
    lastNameInput = data.lastName ?? "";
    birthDdMmYyyy = data.birthDate
      ? (isoDayToDdMmYyyy(data.birthDate) ?? "")
      : "";
    const code = genderGenderToCode(data.gender ?? "unknown");
    genderWrite = code === "" ? "" : code;
    const fk6228 = [...(data.rawFields["6228"] ?? [])];
    befundeInput = fk6228.join("\n") || befundeInput;
  }

  async function parseRemote(): Promise<void> {
    loading = true;
    errorMessage = null;
    try {
      const res = await fetch(`/api/read?strict=${strictMode ? "1" : "0"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gdtText: rawLatin1 }),
      });
      const body = await res.json();
      if (!res.ok || !body?.ok) {
        errorMessage = body?.error ?? `HTTP ${res.status}`;
        lastParsedApi = undefined;
        return;
      }
      const data = body.data as ApiPatient;
      lastParsedApi = data;
      applyParsedToEditors(data);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Netzwerkfehler";
      lastParsedApi = undefined;
    } finally {
      loading = false;
    }
  }

  async function roundTripViaServer(): Promise<void> {
    loading = true;
    errorMessage = null;
    try {
      const lines = befundeInput.split("\n").map((l) => l.trimEnd());
      const befundPayload =
        lines.length <= 1
          ? (lines[0] ?? "")
          : lines.filter((l) => l.length > 0);
      const body: Record<string, unknown> = {
        patientId: patientIdInput,
        befundText: Array.isArray(befundPayload)
          ? befundPayload
          : befundPayload,
        options: {
          recordType: "6310",
          gdtVersion: "02.10",
          receiverDeviceId: "MTDEVICE",
          senderSystemId: "PVSYSTEM",
          examinationDateDdMmYyyy: birthDdMmYyyy || undefined,
          procedureDesignation: "DEMO_INTERFACE",
        },
      };
      if (firstNameInput && lastNameInput) {
        body["demographics"] = {
          firstName: firstNameInput,
          lastName: lastNameInput,
          ...(birthDdMmYyyy.length >= 8
            ? { dateOfBirthDdMmYyyy: birthDdMmYyyy.slice(0, 8) }
            : {}),
          ...(genderWrite ? { genderCode: genderWrite } : {}),
        };
      }
      const w = await fetch("/api/write", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const wJson = await w.json();
      if (!w.ok || !wJson?.latin1Base64) {
        errorMessage = wJson?.error ?? `Schreibfehler HTTP ${w.status}`;
        return;
      }
      rawLatin1 = atobSafeLatin1Utf8Bypass(wJson.latin1Base64 as string);

      await parseRemote();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Netzwerkfehler";
    } finally {
      loading = false;
    }
  }

  function atobSafeLatin1Utf8Bypass(b64: string): string {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return new TextDecoder("latin1").decode(bin);
  }

  async function onPickFile(files: FileList | null): Promise<void> {
    const file = files?.[0];
    if (!file) return;
    loading = true;
    errorMessage = null;
    try {
      const buf = await file.arrayBuffer();
      rawLatin1 = new TextDecoder("iso-8859-1").decode(buf);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void parseRemote();
  });
</script>

<div class="text-foreground relative min-h-svh bg-muted/40 px-5 py-8 font-sans">
  <div class="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-6">
    <header
      class="border-border/80 flex flex-col gap-3 rounded-xl border bg-card p-6 shadow-sm md:p-8"
    >
      <p
        class="text-primary text-xs font-semibold tracking-wide uppercase md:text-sm"
      >
        Medizinisches Datenaustauschformat
      </p>
      <h1
        class="text-foreground text-balance text-3xl font-semibold tracking-tight md:text-4xl"
      >
        GDT Parser &mdash; strukturierte Vorschau
      </h1>
      <p
        class="text-muted-foreground max-w-3xl text-[0.95rem] leading-relaxed md:text-base"
      >
        Laden oder bearbeiten Sie eine GDT-Datei (<span
          class="font-mono text-xs">latin1 / ISO-8859-1</span
        >). Der Server validiert Fremdschlüssel, die Oberfläche zeigt
        Stammdaten, Befundzeilen und eine annotierte Zeilendarstellung zum
        Debuggen peripherer Schnittstellen.
      </p>
    </header>

    <div
      class="border-border/80 flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm sm:px-5"
    >
      <Button
        class="inline-flex gap-2"
        onclick={roundTripViaServer}
        disabled={loading}
      >
        {#if loading}
          <LoaderCircleIcon class="size-4 shrink-0 animate-spin" aria-hidden />
        {/if}
        Serialisieren &amp; zurücklesen
      </Button>
      <Button variant="outline" onclick={parseRemote} disabled={loading}>
        Nur Parsen (&gt; Schnittstelle)
      </Button>
    </div>

    {#if errorMessage}
      <p
        class="text-destructive bg-destructive/8 border-destructive/35 rounded-xl border px-4 py-3 text-sm shadow-sm"
        role="alert"
      >
        {errorMessage}
      </p>
    {/if}

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-stretch">
      <Card
        class="border-border/80 group/card flex h-full min-h-0 flex-col shadow-sm ring-1 ring-black/5"
      >
        <CardHeader>
          <CardTitle>Patientendaten</CardTitle>
          <CardDescription
            >FK&nbsp;3000, 3101, 3102, 3103, 3110 &mdash; editierbare Maske</CardDescription
          >
        </CardHeader>
        <CardContent class="grid gap-x-4 gap-y-3 sm:grid-cols-2">
          <div class="flex min-h-0 flex-col gap-1">
            <label
              class="text-muted-foreground shrink-0 text-xs font-medium leading-none"
              for="pid">Patienten-ID</label
            >
            <input
              id="pid"
              type="text"
              bind:value={patientIdInput}
              autocomplete="off"
              class="{fieldOneLineClass} font-mono"
            />
          </div>
          <div class="flex min-h-0 flex-col gap-1">
            <label
              class="text-muted-foreground shrink-0 text-xs font-medium leading-none"
              for="dob"
            >
              Geburtsdatum (TTMMJJJJ)
            </label>
            <input
              id="dob"
              type="text"
              bind:value={birthDdMmYyyy}
              autocomplete="off"
              inputmode="numeric"
              class="{fieldOneLineClass} font-mono"
            />
          </div>
          <div class="flex min-h-0 flex-col gap-1">
            <label
              class="text-muted-foreground shrink-0 text-xs font-medium leading-none"
              for="fn">Vorname</label
            >
            <input
              id="fn"
              type="text"
              bind:value={firstNameInput}
              autocomplete="given-name"
              class={fieldOneLineClass}
            />
          </div>
          <div class="flex min-h-0 flex-col gap-1">
            <label
              class="text-muted-foreground shrink-0 text-xs font-medium leading-none"
              for="ln">Nachname</label
            >
            <input
              id="ln"
              type="text"
              bind:value={lastNameInput}
              autocomplete="family-name"
              class={fieldOneLineClass}
            />
          </div>
          <div class="flex min-h-0 flex-col gap-1.5 sm:col-span-2">
            <span
              class="text-muted-foreground shrink-0 text-xs font-medium leading-none"
              >Geschlecht (Schreib‑FK)</span
            >
            <div class="flex flex-wrap gap-4">
              <label class="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  class="accent-primary size-4"
                  name="gender"
                  bind:group={genderWrite}
                  value="1"
                />
                <span>männlich (1)</span>
              </label>
              <label class="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  class="accent-primary size-4"
                  name="gender"
                  bind:group={genderWrite}
                  value="2"
                />
                <span>weiblich (2)</span>
              </label>
              <label class="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  class="accent-primary size-4"
                  name="gender"
                  bind:group={genderWrite}
                  value=""
                />
                <span>nicht ausgeben</span>
              </label>
            </div>
          </div>
        </CardContent>
        <CardFooter
          class="mt-auto text-muted-foreground text-xs leading-relaxed"
        >
          {#if lastParsedApi}
            <div class="w-full">
              Interpretiertes FK-Geschlecht:
              <Badge
                variant="outline"
                class="border-primary/35 bg-primary/8 text-primary font-medium"
              >
                {lastParsedApi.gender}
              </Badge>
              {#if lastParsedApi.birthDate}
                &nbsp;&middot;&nbsp;<span
                  >Parsed DOB:&nbsp;<span class="font-mono">
                    {lastParsedApi.birthDate.slice(0, 10)}
                  </span></span
                >
              {/if}
            </div>
          {/if}
        </CardFooter>
      </Card>

      <Card
        class="border-border/80 group/card flex h-full min-h-0 flex-col shadow-sm ring-1 ring-black/5"
      >
        <CardHeader class="border-border/60 border-b pb-4">
          <CardTitle>Roh‑GDT (.gdt)</CardTitle>
          <CardDescription
            >Binärneutraler latin1‑Text&nbsp;&mdash;&nbsp;hier bearbeitbar</CardDescription
          >
        </CardHeader>
        <CardContent class="flex min-h-0 flex-1 flex-col gap-4">
          <div class="flex flex-wrap items-center gap-2">
            <input
              bind:this={fileInputEl}
              class="sr-only"
              type="file"
              accept=".gdt,text/plain,*/*"
              onchange={(event) => {
                void onPickFile(event.currentTarget?.files ?? null);
                event.currentTarget.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="inline-flex gap-2"
              disabled={loading}
              onclick={() => fileInputEl?.click()}
            >
              <UploadIcon class="size-4 shrink-0" aria-hidden />
              <span>.gdt hochladen</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={loading}
              onclick={() => (rawLatin1 = sampleTrainingLatin1())}
            >
              Muster laden
            </Button>
          </div>
          <div
            class="border-border/70 bg-muted/25 rounded-lg border px-3 py-2.5"
          >
            <label
              class="text-foreground flex cursor-pointer items-start gap-2.5 text-sm leading-snug"
            >
              <input
                type="checkbox"
                bind:checked={strictMode}
                class="border-input text-primary focus-visible:ring-ring mt-0.5 size-4 shrink-0 rounded border bg-background focus-visible:ring-2 focus-visible:outline-none"
                onchange={() => void parseRemote()}
              />
              <span class="text-muted-foreground select-none"
                >Strenges Parsen (/api/read?strict=1)</span
              >
            </label>
          </div>
          <Textarea
            bind:value={rawLatin1}
            rows={14}
            spellcheck="false"
            class="font-mono field-sizing-fixed min-h-[240px] w-full flex-1 resize-y text-[11px] leading-snug lg:min-h-[280px]"
          />
        </CardContent>
        <CardFooter class="text-muted-foreground text-xs leading-relaxed">
          Proxy: Browser &rarr; Vite (/api/&hellip;) &rarr;
          <span class="font-mono text-[11px]">localhost:8787</span>
        </CardFooter>
      </Card>
    </div>

    <Card class="border-border/80 w-full shadow-sm ring-1 ring-black/5">
      <CardHeader>
        <CardTitle>Befunde (FK&nbsp;6228)</CardTitle>
        <CardDescription
          >Mehrzeiliger Langtext wird als mehrere FK-Lines serialisiert</CardDescription
        >
      </CardHeader>
      <CardContent>
        <Textarea
          bind:value={befundeInput}
          rows={10}
          class="font-mono text-xs leading-snug"
        />
      </CardContent>
    </Card>

    <Card class="border-border/80 min-w-0 w-full shadow-sm ring-1 ring-black/5">
      <CardHeader>
        <CardTitle>Annotierter Datensatz</CardTitle>
        <CardDescription>
          Clientseitiges Mapping der physischen Zeilen mit Feldbezeichnung (
          <span class="font-mono">{annotatedLines.length}</span>&nbsp;Lines)
        </CardDescription>
      </CardHeader>
      <CardContent class="min-w-0">
        <ScrollArea
          orientation="both"
          type="hover"
          class="border-border/80 h-[min(480px,70vh)] w-full max-w-full rounded-lg border bg-muted/30 shadow-inner"
        >
          {#if loading}
            <div class="flex w-full flex-col gap-2 p-4">
              {#each Array(8) as _}
                <Skeleton class="h-12 w-full max-w-full" />
              {/each}
            </div>
          {:else}
            <table
              class="text-xs [&_td]:border-border/70 [&_td]:px-3 [&_td]:py-2.5 [&_th]:border-border/70 w-full min-w-0 table-fixed border-separate border-spacing-0 [&_td]:border-b [&_th]:border-b"
            >
              <colgroup>
                <col class="w-[3rem]" />
                <col class="w-[4.25rem]" />
                <col class="w-[26%]" />
                <col class="w-[3.5rem]" />
                <col />
              </colgroup>
              <thead class="bg-muted/80 text-foreground sticky top-0 z-[1]">
                <tr>
                  <th class="font-semibold">#</th>
                  <th class="text-center font-semibold">FK</th>
                  <th class="text-center font-semibold">Benennung</th>
                  <th class="text-center font-semibold">LLL</th>
                  <th class="text-center font-semibold">Inhalt</th>
                </tr>
              </thead>
              <tbody>
                {#each annotatedLines as line (line.lineNumber)}
                  <tr
                    class="even:bg-muted/20 hover:bg-muted/40 transition-colors"
                  >
                    <td class="text-muted-foreground font-mono"
                      >{line.lineNumber}</td
                    >
                    <td class="font-mono">{line.fieldId}</td>
                    <td class="min-w-0 break-words leading-snug"
                      >{line.label}</td
                    >
                    <td class="text-right font-mono tabular-nums"
                      >{line.declaredLength}</td
                    >
                    <td class="min-w-0 break-all font-mono leading-snug">
                      {line.payloadPreview}
                      {#if line.parseIssue}
                        <span class="text-destructive block"
                          >{line.parseIssue}</span
                        >
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </ScrollArea>
      </CardContent>
    </Card>
  </div>
</div>
