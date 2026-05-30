interface MiniStatProps {
  value: string | number;
  unit?: string;
  sub: string;
}

function MiniStat({ value, unit, sub }: MiniStatProps) {
  return (
    <div className="card neu" style={{ padding: "18px 20px", flex: 1 }}>
      <div className="stat-num" style={{ fontSize: 30 }}>
        {value}
        {unit && <span style={{ fontSize: 14, color: "var(--muted)", marginLeft: 3 }}>{unit}</span>}
      </div>
      <div className="stat-sub mono">{sub}</div>
    </div>
  );
}

interface StatStripProps {
  openTasks: number;
  hermesActions: number;
}

// Полоса мини-статов. Открытые задачи и действия Hermes — реальные числа;
// сервисы/привычки — мок до своих фаз.
export function StatStrip({ openTasks, hermesActions }: StatStripProps) {
  return (
    <div className="stat-strip">
      <MiniStat value={openTasks} unit="откр." sub="ЗАДАЧИ СЕГОДНЯ" />
      <MiniStat value="6/6" unit="up" sub="СЕРВИСЫ ОНЛАЙН" />
      <MiniStat value={hermesActions} sub="ДЕЙСТВИЙ HERMES / 24Ч" />
      <MiniStat value="68" unit="%" sub="ПРИВЫЧКИ · НЕДЕЛЯ" />
    </div>
  );
}
