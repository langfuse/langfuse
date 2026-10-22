import { env } from "@/src/env.mjs";

type LangfuseIconProps = {
  size?: 14 | 16 | 28 | 32 | 42;
  /** Pass `""` when a visible heading next to the icon already names it. */
  alt?: string;
};

export const LangfuseIcon = ({
  size = 32,
  alt = "Langfuse",
}: LangfuseIconProps) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src={`${env.NEXT_PUBLIC_BASE_PATH ?? ""}/icon.svg`}
    width={size}
    height={size}
    alt={alt}
  />
);
