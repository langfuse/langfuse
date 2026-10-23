import { cva } from "class-variance-authority";

/** A logo tile's box and type per size and shape, for IntegrationLogo and LogoStack's "+N" tile. */
export const logoTileVariants = cva(
  "inline-flex shrink-0 items-center justify-center overflow-hidden font-bold",
  {
    variants: {
      size: {
        xs: "size-4.5 text-xs",
        sm: "size-6 text-xs",
        md: "size-8 text-sm",
        lg: "size-10 text-base",
      },
      shape: {
        circle: "rounded-full",
        rounded: "rounded-md",
      },
    },
  },
);
