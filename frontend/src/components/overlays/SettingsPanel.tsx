import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getServicesConfig,
  putServicesConfig,
  type ServiceConfig,
} from "../../lib/api.ts";

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}

export function SettingsPanel({ open, onOpenChange, onSave }: SettingsPanelProps) {
  const [rows, setRows] = useState<ServiceConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) getServicesConfig().then(setRows);
  }, [open]);

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
      await putServicesConfig(rows.filter((r) => r.name.trim() && r.url.trim()));
      onSave();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>Настройки</DialogTitle>
        </DialogHeader>

        <div>
          <div className="mb-2.5 font-mono text-label uppercase tracking-3 text-muted">
            Homelab Services
          </div>

          <div className="mb-2.5 flex flex-col gap-2">
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  className="h-9 flex-1"
                  placeholder="Имя"
                  value={row.name}
                  onChange={(e) => update(i, "name", e.target.value)}
                />
                <Input
                  className="h-9 flex-[2] font-mono text-xs"
                  placeholder="http://host:port"
                  value={row.url}
                  onChange={(e) => update(i, "url", e.target.value)}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="flex-none text-muted hover:text-bad"
                  onClick={() => removeRow(i)}
                  title="Удалить"
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>

          <Button variant="outline" size="sm" className="self-start" onClick={addRow}>
            <Plus />
            Добавить
          </Button>

          {error && <div className="mt-2.5 text-cell text-bad">{error}</div>}
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? "Сохраняю…" : "Сохранить"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
