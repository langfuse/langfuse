/**
 * Generate the integrations catalog that the setup page lists, from langfuse-docs.
 *
 * Every page under `content/integrations/<category>/` gives one entry: its name, description and logo from
 * the front-matter, and its docs URL. Entries follow each folder's `meta.json` order; the Python and JS/TS SDKs,
 * which have no page there, lead the native category. Categories that don't send traces are left out.
 *
 * The docs come from GitHub through a shallow, sparse git clone, which needs git and network access, or from a
 * local langfuse-docs checkout with `--from`. The output is committed.
 *
 *   pnpm --filter web run generate:integrations
 *   pnpm --filter web run generate:integrations -- --from <langfuse-docs checkout>
 */
import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import prettier from "prettier";

/** @typedef {import("../src/features/setup/integrations/types").Integration} Integration */
/** @typedef {import("../src/features/setup/integrations/types").IntegrationCategory} IntegrationCategory */
/** @typedef {{ title: string, pages: string[] }} FolderMeta */

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DOCS_REPO = "https://github.com/langfuse/langfuse-docs.git";
const DOCS_SITE = "https://langfuse.com";
const CONTENT_DIR = "content/integrations";
const GENERATED_FILE = path.join(
  webDir,
  "src/features/setup/integrations/generated.ts",
);

/**
 * The native folder holds OpenTelemetry; with the SDKs added it reads as this.
 * @type {Record<string, string>}
 */
const TITLE_OVERRIDES = { native: "SDKs & OpenTelemetry" };

/**
 * Folders whose pages don't send traces from an app or agent: `analytics` exports Langfuse metrics to PostHog and
 * Mixpanel or evaluates with Coval and Trubrics; `clickhouse` is ClickHouse's own products (a data-warehouse export,
 * OpenTelemetry to ClickStack as well, a deployment bundle) and LibreChat, which `other` would fit better.
 */
const EXCLUDED_CATEGORIES = new Set(["analytics", "clickhouse"]);

/**
 * The SDKs have no page under content/integrations.
 * @type {Integration[]}
 */
const SDKS = [
  {
    slug: "python-sdk",
    name: "Python SDK",
    category: "native",
    description:
      "Trace any Python app with the Langfuse SDK and the @observe decorator.",
    href: `${DOCS_SITE}/docs/observability/sdk/overview`,
  },
  {
    slug: "js-ts-sdk",
    name: "JS/TS SDK",
    category: "native",
    description:
      "Trace any JavaScript or TypeScript app with the Langfuse SDK on OpenTelemetry.",
    href: `${DOCS_SITE}/docs/observability/sdk/overview`,
  },
];

/**
 * The docs' `logoAppearance`: a dark logo is inverted on a dark page, a light one on a light page.
 * @type {Record<string, "dark" | "light">}
 */
const APPEARANCES = { dark: "dark", light: "light" };

/** @type {(args: string[]) => string} */
function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

/** @type {(file: string) => Promise<FolderMeta>} */
async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

/**
 * "Model Providers" → "Model providers"; words with inner capitals (ClickHouse) keep them.
 * @type {(title: string) => string}
 */
function sentenceCase(title) {
  return title
    .split(" ")
    .map((word, index) =>
      index > 0 && /^[A-Z][a-z]+(-[A-Z][a-z]+)*$/.test(word)
        ? word.toLowerCase()
        : word,
    )
    .join(" ")
    .replace(
      /^(\w+)-([A-Z])/,
      (_, /** @type {string} */ head, /** @type {string} */ letter) =>
        `${head}-${letter.toLowerCase()}`,
    );
}

/** A page file's slug: `<slug>.mdx` or `<slug>.md`, not the folder's own index. */
const PAGE_FILE = /^(?!index\.mdx?$)(.+)\.mdx?$/;

/**
 * The folder's pages, `<slug>.mdx`, `<slug>.md` or `<slug>/index.mdx`, in meta.json order, then any it doesn't
 * list, alphabetically.
 * @type {(folder: string, listed: string[]) => Promise<{ slug: string, file: string }[]>}
 */
async function pagesIn(folder, listed) {
  /** @type {Map<string, string>} */
  const pages = new Map();
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const page = entry.isFile() ? entry.name.match(PAGE_FILE) : null;
    if (page?.[1]) pages.set(page[1], path.join(folder, entry.name));
    if (entry.isDirectory())
      pages.set(entry.name, path.join(folder, entry.name, "index.mdx"));
  }
  const ranked = listed.filter((slug) => pages.has(slug));
  const rest = [...pages.keys()]
    .filter((slug) => !ranked.includes(slug))
    .sort();
  return [...ranked, ...rest].map((slug) => ({
    slug,
    file: pages.get(slug) ?? "",
  }));
}

/** @type {(value: string) => string} */
function unquote(value) {
  const quoted = value.match(/^(["'])([\s\S]*)\1$/);
  return quoted ? (quoted[2] ?? "").replace(/\\(["'])/g, "$1") : value;
}

/** @type {(source: string) => Record<string, string>} */
function frontMatter(source) {
  const block = source.match(/^---\n([\s\S]*?)\n---/);
  if (!block) return {};
  return Object.fromEntries(
    block[1].split("\n").flatMap((line) => {
      const field = line.match(/^(\w+):\s*(.*)$/);
      return field ? [[field[1], unquote((field[2] ?? "").trim())]] : [];
    }),
  );
}

/** @type {(text: string) => string} */
function firstSentence(text) {
  const sentence = text.match(/^(.+?[.!?])(?:\s|$)/);
  return (sentence?.[1] ?? text).trim();
}

/** @type {(category: string, slug: string, source: string) => Integration} */
function entryFor(category, slug, source) {
  const fields = frontMatter(source);
  return {
    slug,
    name: fields.sidebarTitle ?? fields.title ?? slug,
    category,
    description: firstSentence(fields.description ?? ""),
    href: `${DOCS_SITE}/integrations/${category}/${slug}`,
    ...(fields.logo
      ? {
          logo: {
            src: `${DOCS_SITE}${fields.logo}`,
            appearance: APPEARANCES[fields.logoAppearance ?? ""] ?? "color",
          },
        }
      : {}),
  };
}

/** @type {(contentDir: string) => Promise<{ categories: IntegrationCategory[], integrations: Integration[] }>} */
async function readCatalog(contentDir) {
  const order = await readJson(path.join(contentDir, "meta.json"));
  const folders = new Set(
    (await readdir(contentDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  );
  /** @type {IntegrationCategory[]} */
  const categories = [];
  /** @type {Integration[]} */
  const integrations = [...SDKS];
  for (const id of order.pages.filter(
    (page) => folders.has(page) && !EXCLUDED_CATEGORIES.has(page),
  )) {
    const folder = path.join(contentDir, id);
    const meta = await readJson(path.join(folder, "meta.json"));
    categories.push({
      id,
      title: TITLE_OVERRIDES[id] ?? sentenceCase(meta.title),
    });
    for (const page of await pagesIn(folder, meta.pages)) {
      const source = await readFile(page.file, "utf8");
      integrations.push(entryFor(id, page.slug, source));
    }
  }
  return { categories, integrations };
}

/** @type {(catalog: { categories: IntegrationCategory[], integrations: Integration[] }, commit: string) => Promise<string>} */
async function moduleText({ categories, integrations }, commit) {
  const text = `/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Built from langfuse/langfuse-docs@${commit} ${CONTENT_DIR} by scripts/generate-integrations.mjs.
 * Regenerate with: pnpm --filter web run generate:integrations [-- --from <langfuse-docs checkout>]
 */
import type { Integration, IntegrationCategory } from "./types";

export const INTEGRATION_CATEGORIES: IntegrationCategory[] = ${JSON.stringify(categories)};

export const INTEGRATIONS: Integration[] = ${JSON.stringify(integrations)};
`;
  return prettier.format(text, {
    ...((await prettier.resolveConfig(GENERATED_FILE)) ?? {}),
    filepath: GENERATED_FILE,
  });
}

/** @type {(docsDir: string) => Promise<void>} */
async function generateFrom(docsDir) {
  const commit = git(["-C", docsDir, "rev-parse", "--short", "HEAD"]);
  const branch = git(["-C", docsDir, "rev-parse", "--abbrev-ref", "HEAD"]);
  const catalog = await readCatalog(path.join(docsDir, CONTENT_DIR));
  await writeFile(GENERATED_FILE, await moduleText(catalog, commit));
  console.log(
    `Wrote ${catalog.integrations.length} integrations in ${catalog.categories.length} categories from langfuse-docs@${commit} (${branch})`,
  );
}

/** A shallow, sparse clone of the docs' default branch, removed afterwards. */
async function generateFromGitHub() {
  const checkout = await mkdtemp(path.join(os.tmpdir(), "langfuse-docs-"));
  try {
    git([
      "clone",
      "--quiet",
      "--depth",
      "1",
      "--filter=blob:none",
      "--sparse",
      DOCS_REPO,
      checkout,
    ]);
    git(["-C", checkout, "sparse-checkout", "set", CONTENT_DIR]);
    await generateFrom(checkout);
  } finally {
    await rm(checkout, { recursive: true, force: true });
  }
}

const { values: options } = parseArgs({
  options: { from: { type: "string" } },
});

await (options.from
  ? generateFrom(path.resolve(options.from))
  : generateFromGitHub());
