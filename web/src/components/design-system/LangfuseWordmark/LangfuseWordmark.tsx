import { cva, type VariantProps } from "class-variance-authority";
import { env } from "@/src/env.mjs";
import { cn } from "@/src/utils/tailwind";

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
  const basePath = env.NEXT_PUBLIC_BASE_PATH ?? "";
  return (
    <>
      <img
        src={`${basePath}/langfuse-by-clickhouse.svg`}
        alt={alt}
        className={cn(wordmarkVariants({ size }), "block dark:hidden")}
      />
      <img
        src={`${basePath}/langfuse-by-clickhouse-white.svg`}
        alt={alt}
        className={cn(wordmarkVariants({ size }), "hidden dark:block")}
      />
    </>
  );
};
