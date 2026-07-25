import { useMemo } from "react";
import { ChevronRight, Download } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import type {
  DownloadQuotaPeriod,
  DownloadQuotaSnapshot,
} from "@/lib/api";
import { cn } from "@/lib/cn";

export function DownloadQuotaGauge({
  quota,
}: {
  quota: DownloadQuotaSnapshot | null;
}) {
  const gaugePercent = useMemo(
    () => Math.max(0, ...((quota?.periods ?? []).map((period) => period.percent))),
    [quota],
  );

  if (!quota?.configured || quota.available == null) return null;

  const exhausted = quota.available === 0;
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn(
            "group flex h-9 items-center gap-2 rounded-xl border border-hair bg-surface px-2.5 text-left transition-colors duration-150 motion-reduce:transition-none hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/70",
            exhausted && "border-bad/35",
          )}
          aria-label={`Доступно загрузок: ${quota.available}`}
        >
          <span
            className="relative grid size-6 flex-none place-items-center rounded-full"
            style={{
              background: `conic-gradient(var(--accent) ${gaugePercent}%, var(--faint) 0)`,
            }}
          >
            <span className="absolute inset-[3px] rounded-full bg-surface" />
            <span
              className={cn(
                "relative font-mono text-[9px] font-semibold tabular-nums text-ink",
                exhausted && "text-bad",
              )}
            >
              {quota.available}
            </span>
          </span>
          <span className="hidden min-w-0 sm:block">
            <span className="block font-mono text-[9px] uppercase tracking-2 text-muted">
              Загрузки
            </span>
            <span className="block font-mono text-label tabular-nums text-ink-soft">
              доступно {quota.available}
            </span>
          </span>
          <ChevronRight className="hidden size-3.5 text-muted transition-transform duration-150 motion-reduce:transition-none group-data-[state=open]:rotate-90 sm:block" />
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[min(360px,calc(100vw-24px))] rounded-xl border border-hair bg-raise p-4 text-ink outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 motion-reduce:animate-none"
        >
          <div className="flex items-start justify-between gap-4 border-b border-hair pb-3">
            <div>
              <div className="flex items-center gap-2 text-body font-semibold text-ink">
                <Download className="size-4 text-accent" />
                Лимиты загрузок
              </div>
              <p className="mt-1 text-cell text-ink-soft">
                Считаются добавленные торренты
              </p>
            </div>
            <span className="font-mono text-label tabular-nums text-muted">
              {quota.available} доступно
            </span>
          </div>

          <div className="divide-y divide-hair">
            {quota.periods.map((period) => (
              <QuotaPeriodRow key={period.key} period={period} />
            ))}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function QuotaPeriodRow({ period }: { period: DownloadQuotaPeriod }) {
  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-body text-ink">{period.label}</span>
        <span className="font-mono text-cell tabular-nums text-ink-soft">
          {period.used} / {period.limit} · {period.percent}%
        </span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-faint"
        role="progressbar"
        aria-label={period.label}
        aria-valuemin={0}
        aria-valuemax={period.limit}
        aria-valuenow={Math.min(period.used, period.limit)}
      >
        <div
          className={cn(
            "h-full rounded-full bg-accent transition-[width] duration-200 motion-reduce:transition-none",
            period.remaining === 0 && "bg-bad",
          )}
          style={{ width: `${period.percent}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between gap-3 font-mono text-[10px] text-muted">
        <span>осталось {period.remaining}</span>
        {period.resetsAt && <span>{formatReset(period.resetsAt)}</span>}
      </div>
    </div>
  );
}

function formatReset(value: string): string {
  const reset = Date.parse(value);
  if (!Number.isFinite(reset)) return "";
  const diff = Math.max(0, reset - Date.now());
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.ceil((diff % 3_600_000) / 60_000);
  if (hours < 24) return `сброс через ${hours} ч ${minutes} мин`;
  const days = Math.floor(hours / 24);
  return `сброс через ${days} дн ${hours % 24} ч`;
}
