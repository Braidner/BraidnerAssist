import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn.ts";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full font-mono whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border border-hair bg-surface px-2.5 py-0.5 text-label text-muted",
        accent: "border border-accent/25 bg-accent/10 px-2 py-0.5 text-label text-accent",
        warn: "border border-warn/30 bg-warn/10 px-2 py-0.5 text-label text-warn",
        bad: "border border-bad/30 bg-bad/10 px-2 py-0.5 text-label text-bad",
        ok: "border border-ok/30 bg-ok/10 px-2 py-0.5 text-label text-ok",
        outline: "border border-hair px-2 py-0.5 text-label text-muted",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
