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
