import { cva } from "class-variance-authority";
import { type IconComponent } from "@langfuse/icons";
import { cn } from "@/src/utils/tailwind";
import {
  IntegrationLogo,
  logoTileVariants,
} from "../IntegrationLogo/IntegrationLogo";

/** Each item is ringed in the page colour and tucks under the one before it by about a quarter of its width. */
const stackItemVariants = cva(
  "ring-background rounded-full ring-2 first:ml-0",
  {
    variants: {
      size: {
        xs: "-ml-1",
        sm: "-ml-1.5",
        md: "-ml-2",
      },
    },
  },
);

type LogoStackProps = {
  /** Read out for the whole stack, e.g. "Works with OpenAI, LangChain and 6 more". */
  label: string;
  logos: {
    name: string;
    icon?: IconComponent;
    image?: { src: string; appearance: "dark" | "light" | "color" };
  }[];
  size: "xs" | "sm" | "md";
  /** Logos past this count fold into one "+N" tile. */
  max: number;
};

/** A row of round logos overlapping each other, each ringed in the page colour so the edges stay apart. */
export function LogoStack({ label, logos, size, max }: LogoStackProps) {
  const shown = logos.slice(0, max);
  const hiddenCount = logos.length - shown.length;
  return (
    <span role="img" aria-label={label} className="flex items-center">
      {shown.map((logo) => (
        <span
          key={logo.name}
          className={cn("flex", stackItemVariants({ size }))}
        >
          <IntegrationLogo
            name={logo.name}
            icon={logo.icon}
            image={logo.image}
            size={size}
            shape="circle"
            isDecorative
          />
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span
          aria-hidden
          className={cn(
            "bg-muted text-foreground-secondary",
            logoTileVariants({ size, shape: "circle" }),
            stackItemVariants({ size }),
          )}
        >
          +{hiddenCount}
        </span>
      ) : null}
    </span>
  );
}
