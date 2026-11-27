import * as React from "react";
import * as S from "@ds-stories/web/src/components/design-system/Avatar/Avatar.stories";
import appleTouchIcon from "../../web/public/apple-touch-icon.png";

function compose(S: any, key: string) {
  const meta: any = S.default ?? {};
  const st: any = S[key];
  const args: any = { ...(meta.args ?? {}), ...(st && st.args ? st.args : {}) };
  // Storybook resolves argTypes.mapping (control value -> real arg) before
  // rendering; mirror that so mapped args don't render raw.
  const at: any = {
    ...(meta.argTypes ?? {}),
    ...(st && st.argTypes ? st.argTypes : {}),
  };
  for (const k of Object.keys(args)) {
    const m = at[k] && at[k].mapping;
    if (m && typeof m === "object" && args[k] in m) args[k] = m[args[k]];
  }
  const title: string = typeof meta.title === "string" ? meta.title : "";
  const ctx: any = {
    args,
    name: key,
    title,
    kind: title,
    id: "",
    componentId: "",
    globals: {},
    viewMode: "story",
    parameters: (st && st.parameters) ?? meta.parameters ?? {},
  };
  let render: (() => any) | null = null;
  if (st && typeof st.render === "function")
    render = () => st.render(args, ctx);
  else if (typeof st === "function") render = () => st(args, ctx);
  else if (typeof meta.render === "function")
    render = () => meta.render(args, ctx);
  else {
    const C = (st && st.component) || meta.component;
    if (C) render = () => React.createElement(C, args);
  }
  if (!render) return () => null;
  // [].concat: a single function is legal CSF decorator shorthand. A
  // decorator returning undefined (stubbed addon) falls through to the inner
  // render — otherwise one unrecognized addon blanks the cell silently.
  const decorators: any[] = ([] as any[])
    .concat((st && st.decorators) ?? [])
    .concat(meta.decorators ?? []);
  return decorators.reduce(
    (inner: any, dec: any) => () => {
      const out = dec(inner, ctx);
      return out === undefined ? inner() : out;
    },
    render,
  );
}

// Default: the story uses src "/apple-touch-icon.png", served only by
// storybook staticDirs (web/public). Import the same file (bundled as a data
// URL) so the preview shows the real image instead of the fallback initial.
const DefaultStory = compose(
  {
    ...S,
    Default: {
      ...(S as any).Default,
      args: { ...(S as any).Default.args, src: appleTouchIcon },
    },
  },
  "Default",
);
export const Default = /* Default */ DefaultStory;
export const Fallback = /* Fallback */ compose(S, "Fallback");
export const TintedFallback = /* Tinted Fallback */ compose(
  S,
  "TintedFallback",
);
export const WithEmail = /* With Email */ compose(S, "WithEmail");
export const VariantMatrix = /* Variant Matrix */ compose(S, "VariantMatrix");
export const TestHoverNameAndEmail =
  /* (Test) Hover shows name and email */ compose(S, "TestHoverNameAndEmail");
