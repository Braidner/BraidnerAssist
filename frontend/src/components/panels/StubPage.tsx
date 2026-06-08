import { icons, type IconName } from "../icons.tsx";

interface StubPageProps {
  icon: IconName;
  title: string;
}

// Заглушка для пунктов меню, страницы под которые ещё не реализованы.
export function StubPage({ icon, title }: StubPageProps) {
  const Ic = icons[icon];
  return (
    <div className="stub">
      <div className="stub-inner neu">
        <span className="stub-mark"><Ic style={{ width: 30, height: 30 }} /></span>
        <div className="stub-title">{title}</div>
        <div className="stub-sub mono">страница в разработке</div>
      </div>
    </div>
  );
}
