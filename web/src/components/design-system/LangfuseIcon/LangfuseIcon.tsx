import icon from "@/public/icon.svg";
import { SafeImage } from "@/src/components/design-system/SafeImage/SafeImage";

type LangfuseIconProps = {
  size?: 14 | 16 | 24 | 28 | 32 | 42;
  /** Pass `""` when a visible heading next to the icon already names it. */
  alt?: string;
};

export const LangfuseIcon = ({
  size = 32,
  alt = "Langfuse",
}: LangfuseIconProps) => (
  <SafeImage src={icon} width={size} height={size} alt={alt} />
);
