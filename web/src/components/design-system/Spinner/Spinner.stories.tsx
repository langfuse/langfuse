import React from "react";
import preview from "../../../../.storybook/preview";
import Spinner from "./Spinner";

type ComponentProps = React.ComponentProps<typeof Spinner>;
type Variant = NonNullable<ComponentProps["variant"]>;
type Size = NonNullable<ComponentProps["size"]>;

const meta = preview.meta({
  component: Spinner,
});

const allVariants = Object.keys({
  primary: true,
  muted: true,
} satisfies Record<Variant, true>) as Variant[];

const allSizes = Object.keys({
  xxs: true,
  xs: true,
  sm: true,
  md: true,
  lg: true,
  xl: true,
  xxl: true,
  full: true,
} satisfies Record<Size, true>) as Size[];

export const AllVariants = meta.story({
  render: () => (
    <div
      className="grid gap-x-8 gap-y-4"
      style={{
        gridTemplateColumns: `repeat(${allVariants.length}, max-content)`,
      }}
    >
      {allSizes
        .filter((s) => s !== "full")
        .map((s) => (
          <React.Fragment key={s}>
            {allVariants.map((v) => (
              <div key={v + s}>
                <div className="mb-2 flex gap-2">
                  <div>{v}</div>
                  <div>{s}</div>
                </div>
                <Spinner size={s} variant={v} />
              </div>
            ))}
          </React.Fragment>
        ))}
    </div>
  ),
});
