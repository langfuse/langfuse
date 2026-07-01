import { cva } from "class-variance-authority";
import { Loader2 } from "lucide-react";

const classes = cva("animate-spin", {
  variants: {
    variant: {
      primary: "text-primary",
      muted: "text-muted-foreground",
    },
    size: {
      xxs: "size-3",
      xs: "size-3.5",
      sm: "size-4",
      md: "size-5",
      lg: "size-6",
      xl: "size-8",
      xxl: "size-12",
      full: "size-full",
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
