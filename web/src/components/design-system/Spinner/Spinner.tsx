import { cva } from "class-variance-authority";
import { Loader2 } from "lucide-react";

const classes = cva("animate-spin", {
  variants: {
    variant: {
      primary: "text-primary",
      muted: "text-muted-foreground",
    },
    size: {
      xxs: "h-3 w-3",
      xs: "h-3.5 w-3.5",
      sm: "h-4 w-4",
      md: "h-5 w-5",
      lg: "h-6 w-6",
      xl: "h-8 w-8",
      xxl: "h-12 w-12",
      full: "h-full w-full",
    },
    display: {
      block: "block",
      inline: "inline",
    },
  },
  defaultVariants: { display: "block" },
});

type ClassProps = NonNullable<Parameters<typeof classes>["0"]>;

type Variant = NonNullable<ClassProps["variant"]>;
type Size = NonNullable<ClassProps["size"]>;
type Display = NonNullable<ClassProps["display"]>;

export default function Spinner({
  variant,
  size,
  display,
}: {
  variant?: Variant;
  size: Size;
  display?: Display;
}) {
  return <Loader2 className={classes({ variant, size, display })} />;
}
