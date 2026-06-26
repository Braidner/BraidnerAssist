# React + Tailwind v4 component patterns

## The `cn()` helper

Every component that accepts a `className` should merge it through `cn()`. `clsx` resolves
conditional/array class inputs; `tailwind-merge` removes conflicting Tailwind utilities so the
last one wins (a caller's `px-4` cleanly overrides a default `px-2`).

```bash
npm install clsx tailwind-merge
```

```ts
// lib/cn.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

## Example: typed Button with variants

```tsx
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent-500 text-white hover:bg-accent-700",
  secondary: "bg-accent-100 text-accent-900 hover:bg-accent-300",
  ghost: "bg-transparent text-accent-700 hover:bg-accent-100",
};

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium",
        "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
```

Notes: a real `<button>` (keyboard + screen-reader support for free), `focus-visible`
outline, disabled handling, and `className` last so callers can override.

## Example: responsive, semantic card

Mobile-first — base styles target small screens, `md:` adjusts for larger ones.

```tsx
import { cn } from "@/lib/cn";

interface StatCardProps {
  label: string;
  value: string;
  className?: string;
}

export function StatCard({ label, value, className }: StatCardProps) {
  return (
    <article
      className={cn(
        "flex flex-col gap-1 rounded-card bg-bg p-4 shadow-sm",
        "md:flex-row md:items-baseline md:justify-between md:p-6",
        className,
      )}
    >
      <h3 className="text-sm font-medium text-fg/70">{label}</h3>
      <p className="text-2xl font-semibold tabular-nums text-fg">{value}</p>
    </article>
  );
}
```

## Example: responsive grid layout

```tsx
<section className="grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-3">
  {items.map((it) => (
    <StatCard key={it.label} label={it.label} value={it.value} />
  ))}
</section>
```

Use `grid`/`flex` utilities for structure rather than custom CSS, and let the theme tokens
(`gap-gutter`, `rounded-card`, `bg-bg`/`text-fg`) carry design decisions.
