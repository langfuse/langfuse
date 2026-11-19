import { cva, type VariantProps } from "class-variance-authority";
import wordmark from "@/public/langfuse-by-clickhouse.svg";
import whiteWordmark from "@/public/langfuse-by-clickhouse-white.svg";
import { cn } from "@/src/utils/tailwind";
import { SafeImage } from "@/src/components/design-system/SafeImage/SafeImage";

const wordmarkVariants = cva("w-auto max-w-none", {
  variants: {
    size: {
      sm: "h-6",
      md: "h-7",
      lg: "h-10",
    },
  },
  defaultVariants: {
    size: "lg",
  },
});

type LangfuseWordmarkProps = VariantProps<typeof wordmarkVariants> & {
  /** Pass `""` when a visible heading next to the wordmark already names it. */
  alt?: string;
};

/** Full "Langfuse by ClickHouse" wordmark that follows the light/dark theme. */
export const LangfuseWordmark = ({
  size,
  alt = "Langfuse by ClickHouse",
}: LangfuseWordmarkProps) => {
  return (
    <>
      <SafeImage
        src={wordmark}
        alt={alt}
        className={cn(wordmarkVariants({ size }), "block dark:hidden")}
      />
      <SafeImage
        src={whiteWordmark}
        alt={alt}
        className={cn(wordmarkVariants({ size }), "hidden dark:block")}
      />
    </>
  );
};
