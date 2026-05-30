import { Card } from "../Card.tsx";
import { icons, type IconName } from "../icons.tsx";

interface PlaceholderProps {
  icon: IconName;
  title: string;
  phase: string;
}

// Неоморфный плейсхолдер для ещё не подключённых интеграций (Погода/HA/Календарь).
export function Placeholder({ icon, title, phase }: PlaceholderProps) {
  const Ic = icons[icon];
  return (
    <Card icon={icon} title={title} className="is-placeholder">
      <div className="placeholder-body">
        <span className="ph-icon neu-sm"><Ic /></span>
        <span className="ph-text">Не подключено</span>
        <span className="ph-phase">{phase}</span>
      </div>
    </Card>
  );
}
