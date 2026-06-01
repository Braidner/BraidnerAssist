import { useEffect, useState } from "react";
import { icons } from "../icons.tsx";
import { getServicesConfig, putServicesConfig, type ServiceConfig } from "../../lib/api.ts";

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
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));

  const addRow = () => setRows((rs) => [...rs, { name: "", url: "" }]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

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
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card neu settings-panel">
        <div className="settings-header">
          <span className="settings-title">
            <icons.gear style={{ width: 16, height: 16, marginRight: 8, opacity: 0.7 }} />
            Настройки
          </span>
          <button className="pill" onClick={onClose} title="Закрыть">
            <icons.close style={{ width: 14, height: 14 }} />
          </button>
        </div>

        <div className="settings-section-label">Homelab Services</div>

        <div className="settings-list">
          {rows.map((row, i) => (
            <div key={i} className="settings-row">
              <input
                className="settings-input neu-in"
                placeholder="Имя"
                value={row.name}
                onChange={(e) => update(i, "name", e.target.value)}
              />
              <input
                className="settings-input settings-input--url neu-in"
                placeholder="http://host:port"
                value={row.url}
                onChange={(e) => update(i, "url", e.target.value)}
              />
              <button className="settings-del" onClick={() => removeRow(i)} title="Удалить">
                <icons.close style={{ width: 13, height: 13 }} />
              </button>
            </div>
          ))}
        </div>

        <button className="settings-add pill" onClick={addRow}>
          <icons.plus style={{ width: 14, height: 14, marginRight: 4 }} />
          Добавить
        </button>

        {error && <div className="settings-error">{error}</div>}

        <div className="settings-footer">
          <button className="settings-save neu" onClick={save} disabled={saving}>
            {saving ? "Сохраняю…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
