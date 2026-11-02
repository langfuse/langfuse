import { type TSESTree } from "@typescript-eslint/utils";

import { createRule } from "../util.js";
import { extractTailwindUtilityTokens } from "../rule-helpers/tailwind.js";

// Colors must come from the design-token system (palette utilities like
// `bg-destructive` / `text-muted-foreground`, or token-backed arbitrary values
// like `bg-[hsl(var(--muted))]`). A raw color smuggled through an arbitrary
// value (`bg-[#ff0000]`, `text-[rgb(0,0,0)]`, `shadow-[0_8px_16px_rgb(0_0_0/0.3)]`)
// bypasses theming: it won't follow light/dark mode or future palette changes.
//
// Detection is restricted to what is unambiguous:
//   - a hex color literal (`#fff`, `#ff0000aa`) anywhere inside the brackets;
//   - a color function (`rgb(…)`, `rgba(…)`, `hsl(…)`, `hsla(…)`, `oklch(…)`,
//     `oklab(…)`, `lab(…)`, `lch(…)`, `hwb(…)`, `color(…)`) whose arguments do
//     NOT start with `var(` — `hsl(var(--foreground))` is the token-backed
//     escape hatch and stays allowed;
//   - a bracket value that IS a named CSS color (`bg-[red]`).
//
// Pure lengths/geometry (`border-[3px]`, `text-[10px]`,
// `shadow-[0_1px_2px_var(--shadow)]`) never match, and `transparent` /
// `currentColor` / `inherit` are contextual keywords, not raw palette colors.
const COLOR_UTILITY_PATTERN =
  /^(?:bg|text|border|ring|fill|stroke|outline|shadow|decoration|divide|from|to|via|accent|caret)(?:-[a-z]+)*-\[([^\]]*)\](?:\/.*)?$/;

const HEX_COLOR_PATTERN = /#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z])/;

// A color function opener whose first argument is not `var(…)`. Arbitrary
// values encode spaces as underscores, so the lookahead skips `_`/whitespace
// before checking for `var(` (anchored at the paren so it cannot backtrack).
// The leading guard keeps `color(` from matching inside longer identifiers
// such as `color-mix(` or `var(--color-1)`.
const RAW_COLOR_FUNCTION_PATTERN =
  /(?:^|[^a-zA-Z0-9-])(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\((?![\s_]*var\()/;

// The CSS named colors (spec keyword set), lowercase. `transparent`,
// `currentcolor`, and `inherit` are intentionally absent — they reference
// context rather than naming a raw color.
const NAMED_CSS_COLORS = new Set(
  (
    "aliceblue antiquewhite aqua aquamarine azure beige bisque black " +
    "blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse " +
    "chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan " +
    "darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta " +
    "darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen " +
    "darkslateblue darkslategray darkslategrey darkturquoise darkviolet " +
    "deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite " +
    "forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green " +
    "greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender " +
    "lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan " +
    "lightgoldenrodyellow lightgray lightgreen lightgrey lightpink " +
    "lightsalmon lightseagreen lightskyblue lightslategray lightslategrey " +
    "lightsteelblue lightyellow lime limegreen linen magenta maroon " +
    "mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen " +
    "mediumslateblue mediumspringgreen mediumturquoise mediumvioletred " +
    "midnightblue mintcream mistyrose moccasin navajowhite navy oldlace " +
    "olive olivedrab orange orangered orchid palegoldenrod palegreen " +
    "paleturquoise palevioletred papayawhip peachpuff peru pink plum " +
    "powderblue purple rebeccapurple red rosybrown royalblue saddlebrown " +
    "salmon sandybrown seagreen seashell sienna silver skyblue slateblue " +
    "slategray slategrey snow springgreen steelblue tan teal thistle tomato " +
    "turquoise violet wheat white whitesmoke yellow yellowgreen"
  ).split(" "),
);

function containsRawColor(bracketValue: string): boolean {
  return (
    HEX_COLOR_PATTERN.test(bracketValue) ||
    RAW_COLOR_FUNCTION_PATTERN.test(bracketValue) ||
    NAMED_CSS_COLORS.has(bracketValue.toLowerCase())
  );
}

function firstRawColorUtility(value: string): string | null {
  for (const utility of extractTailwindUtilityTokens(value)) {
    const match = COLOR_UTILITY_PATTERN.exec(utility);
    if (match && containsRawColor(match[1])) return utility;
  }
  return null;
}

const rule = createRule({
  name: "no-arbitrary-colors",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow raw colors (hex, rgb/hsl/oklch literals, named CSS colors) in arbitrary Tailwind color utilities. Colors must come from design tokens — palette utilities (bg-destructive, text-muted-foreground, …) or token-backed values (bg-[hsl(var(--muted))]).",
    },
    schema: [],
    messages: {
      unexpected:
        "Avoid the raw color in `{{utility}}` — it bypasses theming (light/dark mode, palette changes). Use a design-token utility (e.g. `bg-destructive`, `text-muted-foreground`, `border-warning`) or a token-backed value like `bg-[hsl(var(--muted))]` instead.",
    },
  },
  defaultOptions: [],
  create(context) {
    function check(node: TSESTree.Node, raw: unknown) {
      if (typeof raw !== "string") return;
      const utility = firstRawColorUtility(raw);
      if (utility !== null) {
        context.report({ node, messageId: "unexpected", data: { utility } });
      }
    }
    return {
      Literal(node) {
        check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.raw);
      },
    };
  },
});

export default rule;
