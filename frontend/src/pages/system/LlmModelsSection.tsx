import { useEffect, useRef, useState } from "react";
import { Card } from "../../components/ui/Card.tsx";
import { Placeholder } from "../../components/panels/Placeholder.tsx";
import { icons } from "../../components/icons.tsx";
import { cn } from "../../lib/cn.ts";
import { ui } from "../../lib/ui.ts";
import { humanBytes, fmtUpdated } from "../../lib/format.ts";
import type {
  LlmFileKind,
  LlmModel,
  LlmModelFile,
  LlmModelsData,
} from "../../lib/api.ts";
import { getLlmModels } from "../../lib/api.ts";

const FAST_POLL = 5_000; // активна загрузка/стопор — часто
const SLOW_POLL = 60_000; // всё готово — редко

const EMPTY: LlmModelsData = {
  configured: false,
  root: "",
  totalBytes: 0,
  disk: null,
  models: [],
};

const chip =
  "inline-flex items-center whitespace-nowrap rounded-full border border-hair bg-surface px-2.5 py-0.5 font-mono text-2xs uppercase tracking-3 text-muted";
const tagChip = cn(
  chip,
  "border-accent/25 bg-accent/[0.07] text-accent",
);
const fileRow =
  "grid grid-cols-[1fr_auto_auto] items-center gap-2.5 border-t border-hair py-1.5 text-body";
const fileName = "min-w-0 truncate text-row text-ink-soft";
const fileTag = "font-mono text-data text-muted";

const FILE_KIND_LABEL: Record<LlmFileKind, string> = {
  model: "MODEL",
  mmproj: "MMPROJ",
  draft: "DRAFT",
  other: "OTHER",
};

function modelsLabel(n: number): string {
  const d10 = n % 10;
  const d100 = n % 100;
  const word =
    d10 === 1 && d100 !== 11
      ? "модель"
      : d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)
        ? "модели"
        : "моделей";
  return `${n} ${word}`;
}

function mainQuant(model: LlmModel): string | null {
  const main = model.files.find((f) => f.kind === "model");
  return main?.quant ?? null;
}

function StatusLine({ model }: { model: LlmModel }) {
  if (model.status === "downloading" || model.status === "stalled") {
    const pct = model.progressPct ?? 0;
    const warn = model.status === "stalled";
    return (
      <div className="flex flex-col gap-1.5">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${Math.min(100, Math.max(0, pct))}%`,
              background: warn ? "var(--warn)" : "var(--accent)",
              boxShadow: warn ? undefined : "var(--accent-glow-sm)",
            }}
          />
        </div>
        <div className="flex items-center justify-between font-mono text-2xs text-muted">
          <span style={{ color: warn ? "var(--warn)" : "var(--accent)" }}>
            {warn ? "загрузка остановилась" : `${Math.round(pct)}%`}
          </span>
          <span>
            {humanBytes(model.sizeBytes)} /{" "}
            {humanBytes(model.expectedBytes ?? model.sizeBytes)}
          </span>
        </div>
      </div>
    );
  }

  if (model.status === "error") {
    return (
      <div className="flex items-start gap-2 font-mono text-2xs text-bad">
        <span className="mt-[3px] size-2 flex-none rounded-full bg-bad" />
        <span className="min-w-0 break-words">
          {model.error ?? "Ошибка загрузки"}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 font-mono text-2xs text-ok">
      <span className="size-2 flex-none rounded-full bg-ok" />
      готово · {humanBytes(model.sizeBytes)}
    </div>
  );
}

function FileRow({ file }: { file: LlmModelFile }) {
  return (
    <div className={fileRow}>
      <span className={fileName} title={file.name}>
        {file.name}
      </span>
      <span className={fileTag}>{FILE_KIND_LABEL[file.kind]}</span>
      <span className={fileTag}>{humanBytes(file.sizeBytes)}</span>
    </div>
  );
}

function ModelCard({ model }: { model: LlmModel }) {
  const quant = mainQuant(model);
  const addedLabel = model.addedAt ? fmtUpdated(model.addedAt) : null;

  return (
    // Вложена в Card группы (bg-raise) → на тон ниже по лестнице поверхностей.
    <div className={cn(ui.panel, "anim flex min-w-0 flex-col gap-3 bg-surface p-5")}>
      <div className="min-w-0">
        {model.org && (
          <div className="truncate font-mono text-2xs uppercase tracking-3 text-muted">
            {model.org}
          </div>
        )}
        <div
          className="truncate text-row font-semibold text-ink"
          title={model.name}
        >
          {model.name}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className={chip}>{model.format.toUpperCase()}</span>
        {model.params && <span className={chip}>{model.params}</span>}
        {quant && <span className={chip}>{quant}</span>}
        {model.tags.map((t) => (
          <span key={t} className={tagChip}>
            {t}
          </span>
        ))}
      </div>

      <StatusLine model={model} />

      {model.files.length > 0 && (
        <div className="flex flex-col">
          {model.files.map((f) => (
            <FileRow key={f.name} file={f} />
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        {model.url ? (
          <a
            href={model.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-mono text-2xs text-muted transition-colors hover:text-accent"
          >
            <icons.external className="size-3" />
            HF
          </a>
        ) : (
          <span />
        )}
        {addedLabel && (
          <span className="font-mono text-2xs text-muted">
            добавлена {addedLabel}
          </span>
        )}
      </div>
    </div>
  );
}

// /system — отдельная полноширинная группа: локальные LLM-модели (llm-pull.sh).
export function LlmModelsSection() {
  const [data, setData] = useState<LlmModelsData>(EMPTY);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      const fresh = await getLlmModels();
      if (cancelled) return;
      setData(fresh);
      const active = fresh.models.some(
        (m) => m.status === "downloading" || m.status === "stalled",
      );
      timerRef.current = setTimeout(tick, active ? FAST_POLL : SLOW_POLL);
    };

    tick();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!data.configured) {
    return (
      <Placeholder
        icon="cpu"
        title="LLM модели"
        phase="LLM_MODELS_DIR не задан"
      />
    );
  }

  return (
    <Card
      icon="cpu"
      title="LLM модели"
      action={
        <div className="flex flex-wrap items-center gap-4 font-mono text-pill text-muted">
          <span>{modelsLabel(data.models.length)}</span>
          <span>{humanBytes(data.totalBytes)}</span>
          {data.disk && (
            <span>
              {humanBytes(data.disk.freeBytes)} свободно из{" "}
              {humanBytes(data.disk.totalBytes)}
            </span>
          )}
        </div>
      }
    >
      {data.models.length === 0 ? (
        <div className="py-2.5 font-mono text-xs text-muted">
          Здесь появятся модели после запуска homelab/llm-pull.sh.
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-[22px] max-narrow:grid-cols-1">
          {data.models.map((m) => (
            <ModelCard key={m.id} model={m} />
          ))}
        </div>
      )}
    </Card>
  );
}
