import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-wide",
  {
    variants: {
      variant: {
        default: "border-transparent bg-ink text-accent-fg",
        accent: "border-transparent bg-accent text-accent-fg",
        outline: "border-line bg-transparent text-muted",
        good: "border-transparent bg-good/12 text-good",
        warn: "border-transparent bg-warn/12 text-warn",
        surface: "border-line bg-surface-2 text-ink",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
