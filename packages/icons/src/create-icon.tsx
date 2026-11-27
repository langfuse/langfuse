import {
  forwardRef,
  type ComponentType,
  type CSSProperties,
  type SVGProps,
} from "react";

const sizes = { sm: 12, base: 14, lg: 20, xl: 28 } as const;
const colors = {
  // Leave color unset so parent-owned states and raw color classes still apply.
  inherit: undefined,
  default: "hsl(var(--icon-foreground))",
  foreground: "hsl(var(--foreground))",
  muted: "hsl(var(--muted-foreground))",
  secondary: "hsl(var(--foreground-secondary))",
  tertiary: "hsl(var(--foreground-tertiary))",
  destructive: "hsl(var(--destructive))",
} as const;

export type IconSize = keyof typeof sizes;
export type IconColor = keyof typeof colors;

export type IconProps = Omit<
  SVGProps<SVGSVGElement>,
  "className" | "style" | "width" | "height" | "strokeWidth" | "size" | "color"
> & {
  size?: IconSize;
  color?: IconColor;
  className?: never;
  style?: never;
  width?: never;
  height?: never;
  strokeWidth?: never;
  /** Escape hatch. Prefer semantic props and inherited color; avoid custom icon classes. */
  __rawClassName?: string;
  /** Escape hatch. Avoid overriding design tokens; use only when semantic props cannot express the requirement. */
  __rawStyle?: CSSProperties;
};

export type IconComponent = ReturnType<typeof createIcon>;

export function createIcon(
  Component: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>,
  displayName: string,
  strokeWidth: number,
) {
  const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(
    {
      size = "base",
      color = "inherit",
      __rawClassName,
      __rawStyle,
      className: _className,
      style: _style,
      width: _width,
      height: _height,
      strokeWidth: _strokeWidth,
      ...props
    },
    ref,
  ) {
    return (
      <Component
        {...props}
        ref={ref}
        size={sizes[size]}
        width={sizes[size]}
        height={sizes[size]}
        strokeWidth={strokeWidth}
        className={__rawClassName}
        style={{ flexShrink: 0, color: colors[color], ...__rawStyle }}
      />
    );
  });
  Icon.displayName = displayName;
  return Icon;
}
