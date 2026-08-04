import { type TSESTree } from "@typescript-eslint/utils";

import { createRule } from "../util.js";
import { extractTailwindUtilityTokens } from "../rule-helpers/tailwind.js";

// Colors must come from the design-token system — role utilities like
// `bg-primary`, `text-muted-foreground`, `border-destructive`, or the
// semantic `--obs-*` / `--score-*` token families. A raw Tailwind palette
// color (`bg-blue-500`, `hover:text-red-600`, `border-gray-200`) hardcodes a
// hue and lightness that won't follow light/dark mode or future palette
// changes, and re-introduces the ad-hoc coloring the design-system refresh
// removed.
//
// Banned: any color-property utility whose value is a Tailwind palette name
// plus numeric shade (`text-red-500`, `bg-slate-50/50`, `from-emerald-400`,
// `border-t-gray-200`), including variant-prefixed (`hover:`, `dark:`,
// `data-[state=open]:`, …) and important-marked (`!bg-red-500`,
// `bg-red-500!`) forms — plus the raw `text-white` / `bg-white` /
// `text-black` / `bg-black` utilities (and their `/opacity` forms).
//
// NOT this rule's scope: arbitrary values like `bg-[#fff]` or
// `text-[rgb(0,0,0)]` — those are `no-arbitrary-colors`' job.
//
// Existing usages are grandfathered via the `allowFiles` option (the burn-down
// baseline configured in eslint.config.mjs); the rule is silent in those
// files. An entry ending in `/` silences the whole directory.
const COLOR_UTILITY_PREFIXES = [
  "text",
  "bg",
  "border",
  "ring",
  "fill",
  "stroke",
  "from",
  "to",
  "via",
  "decoration",
  "outline",
  "accent",
  "caret",
  "divide",
  "shadow",
  "ring-offset",
].join("|");

const PALETTE_COLOR_NAMES = [
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
].join("|");

// A palette color utility after variant/important stripping. The optional
// side segment covers directional forms (`border-t-red-500`,
// `divide-y-gray-200`, `border-x-blue-300`). The optional trailing modifier
// covers opacity (`bg-red-500/50`, `bg-red-500/[0.35]`).
const RAW_PALETTE_UTILITY_PATTERN = new RegExp(
  `^(?:${COLOR_UTILITY_PREFIXES})` +
    `(?:-(?:[xysetrbl]|tl|tr|bl|br))?` +
    `-(?:${PALETTE_COLOR_NAMES})` +
    `-[0-9]{2,3}` +
    `(?:/(?:[0-9]{1,3}|\\[[^\\]]+\\]))?$`,
);

// Raw white/black text/background — hardcoded lightness extremes that invert
// wrongly across themes. Kept to the `text`/`bg` properties only.
const RAW_WHITE_BLACK_UTILITY_PATTERN =
  /^(?:text|bg)-(?:white|black)(?:\/(?:[0-9]{1,3}|\[[^\]]+\]))?$/;

function isRawColorUtility(utility: string): boolean {
  return (
    RAW_PALETTE_UTILITY_PATTERN.test(utility) ||
    RAW_WHITE_BLACK_UTILITY_PATTERN.test(utility)
  );
}

function firstRawColorUtility(value: string): string | null {
  for (const utility of extractTailwindUtilityTokens(value)) {
    if (isRawColorUtility(utility)) return utility;
  }
  return null;
}

// Whether the linted file is covered by an `allowFiles` baseline entry.
// Entries are repo-relative POSIX paths (e.g. `web/src/components/Foo.tsx`);
// an entry with a trailing `/` silences the whole directory. ESLint hands the
// rule an absolute filename, so entries are matched as path suffixes (or
// path-segment infixes for directories).
function isAllowedFile(filename: string, allowFiles: string[]): boolean {
  const normalized = filename.replaceAll("\\", "/");
  return allowFiles.some((entry) =>
    entry.endsWith("/")
      ? normalized.includes(`/${entry}`) || normalized.startsWith(entry)
      : normalized.endsWith(`/${entry}`) || normalized === entry,
  );
}

const rule = createRule<[{ allowFiles: string[] }], "unexpected">({
  name: "no-raw-colors",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow raw Tailwind palette color utilities (bg-blue-500, text-red-600, border-gray-200, text-white, …). Colors must come from role tokens (bg-primary, text-muted-foreground, border-destructive, --obs-*, …) so they follow theming — see the Storybook Design → Color page.",
    },
    schema: [
      {
        type: "object",
        properties: {
          allowFiles: {
            type: "array",
            items: { type: "string" },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unexpected:
        "Avoid the raw Tailwind palette color `{{utility}}` — it bypasses theming (light/dark mode, palette changes). Use a role token instead (e.g. `bg-primary`, `text-muted-foreground`, `border-destructive`, the `--obs-*`/`--score-*` families) — see Storybook → Design → Color for the full set.",
    },
  },
  defaultOptions: [{ allowFiles: [] }],
  create(context, [{ allowFiles }]) {
    // Grandfathered baseline file — stay silent so the burn-down list in
    // eslint.config.mjs can shrink file by file.
    if (isAllowedFile(context.filename, allowFiles)) return {};

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
