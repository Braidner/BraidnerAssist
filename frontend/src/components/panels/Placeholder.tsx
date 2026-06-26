import { Card } from "../ui/Card.tsx";
import { icons, type IconName } from "../icons.tsx";

interface PlaceholderProps {
  icon: IconName;
  title: string;
  phase: string;
}

// Плоский плейсхолдер для ещё не подключённых интеграций (Погода/HA/Календарь).
export function Placeholder({ icon, title, phase }: PlaceholderProps) {
  const Ic = icons[icon];
  return (
    <Card icon={icon} title={title} className="justify-center">
      <div className="flex flex-col items-start gap-1 py-1.5">
        <span className="mb-2 grid size-[42px] place-items-center rounded-[13px] border border-hair bg-surface text-muted">
          <Ic className="size-5" />
        </span>
        <span className="text-body text-ink-soft">Не подключено</span>
        <span className="font-mono text-data tracking-1 text-muted">
          {phase}
        </span>
      </div>
    </Card>
  );
}
