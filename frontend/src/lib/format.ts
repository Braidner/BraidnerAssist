// Человекочитаемый размер (Б/КБ/МБ/ГБ/ТБ) — общий помощник для панелей.
export function humanBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

// Относительное «… назад» для дат (общий помощник для панелей).
export function fmtUpdated(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);

  if (diffMin < 2) return "только что";
  if (diffMin < 60) return `${diffMin}м назад`;
  if (diffH < 24) return `${diffH}ч назад`;
  if (diffD === 1) return "вчера";
  if (diffD < 7) return `${diffD}д назад`;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}
