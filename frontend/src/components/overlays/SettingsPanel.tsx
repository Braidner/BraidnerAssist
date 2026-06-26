import { useEffect, useState } from "react";
import { cn } from "../../lib/cn.ts";
import { icons } from "../icons.tsx";
import {
  getServicesConfig,
  putServicesConfig,
  type ServiceConfig,
} from "../../lib/api.ts";
import { ui } from "../../lib/ui.ts";

interface SettingsPanelProps {
  onClose: () => void;
  onSave: () => void;
}

export function SettingsPanel({ onClose, onSave }: SettingsPanelProps) {
  const [rows, setRows] = useState<ServiceConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getServicesConfig().then(setRows);
  }, []);

  const update = (i: number, field: keyof ServiceConfig, value: string) =>
    setRows((rs) =>
      rs.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)),
    );

  const addRow = () => setRows((rs) => [...rs, { name: "", url: "" }]);
  const removeRow = (i: number) =>
    setRows((rs) => rs.filter((_, idx) => idx !== i));

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      await putServicesConfig(
        rows.filter((r) => r.name.trim() && r.url.trim()),
      );
      onSave();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] grid place-items-center bg-black/55 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex w-[min(540px,100%)] flex-col rounded-card border border-hair bg-raise px-7 py-6">
        <div className="mb-[18px] flex items-center justify-between">
          <span className="flex items-center text-[15px] font-semibold text-ink">
            <icons.gear
              style={{ width: 16, height: 16, marginRight: 8, opacity: 0.7 }}
            />
            Настройки
          </span>
          <button className={ui.pill} onClick={onClose} title="Закрыть">
            <icons.close style={{ width: 14, height: 14 }} />
          </button>
        </div>

        <div className="mb-2.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted">
          Homelab Services
        </div>

        <div className="mb-2.5 flex flex-col gap-2">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className={cn(ui.input, "h-9 flex-1 py-0")}
                placeholder="Имя"
                value={row.name}
                onChange={(e) => update(i, "name", e.target.value)}
              />
              <input
                className={cn(ui.input, "h-9 flex-[2] py-0 font-mono text-xs")}
                placeholder="http://host:port"
                value={row.url}
                onChange={(e) => update(i, "url", e.target.value)}
              />
              <button
                className="grid size-[30px] flex-none place-items-center rounded-lg border border-transparent bg-transparent text-muted transition-colors hover:border-bad/40 hover:text-bad"
                onClick={() => removeRow(i)}
                title="Удалить"
              >
                <icons.close style={{ width: 13, height: 13 }} />
              </button>
            </div>
          ))}
        </div>

        <button className={cn(ui.pill, "mb-3.5 self-start")} onClick={addRow}>
          <icons.plus style={{ width: 14, height: 14, marginRight: 4 }} />
          Добавить
        </button>

        {error && <div className="mb-2.5 text-[12.5px] text-bad">{error}</div>}

        <div className="mt-1 flex justify-end">
          <button className={cn(ui.button.base, "px-5")} onClick={save} disabled={saving}>
            {saving ? "Сохраняю…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
