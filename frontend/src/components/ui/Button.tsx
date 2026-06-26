import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn.ts";

const buttonVariants = cva(
  "inline-flex flex-none cursor-pointer items-center justify-center gap-[7px] whitespace-nowrap font-medium leading-none transition-[background-color,border-color,color,transform] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/70 disabled:cursor-default disabled:opacity-45",
  {
    variants: {
      variant: {
        default:
          "border border-hair bg-raise text-ink-soft hover:border-accent/40 hover:bg-surface-2 hover:text-ink hover:-translate-y-px active:translate-y-0 active:border-accent/60 active:text-accent",
        accent:
          "border border-accent/70 bg-accent text-accent-ink hover:bg-accent hover:text-accent-ink active:text-accent-ink",
        ghost:
          "border border-transparent bg-transparent text-muted hover:border-hair hover:bg-surface hover:text-ink-soft active:text-ink",
        danger:
          "border border-transparent bg-transparent text-muted hover:border-bad/40 hover:text-bad active:text-bad",
      },
      size: {
        md: "h-9 rounded-xl px-4 text-body",
        sm: "h-[30px] rounded-[10px] px-3 text-xs gap-[5px]",
        icon: "size-10 rounded-[13px] px-0",
        iconSm: "size-[30px] rounded-[10px] px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
