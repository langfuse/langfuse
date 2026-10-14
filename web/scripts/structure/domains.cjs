const { existsSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");

/** @typedef {{ domains?: { path: string, title?: string }[], sharedRoots?: string[], moves?: { from: string, to: string }[] }} SourceStructure */

const LEGACY_SHARED_ROOTS = [
  "src/components",
  "src/hooks",
  "src/utils",
  "src/constants",
  "src/contexts",
  "src/stores",
  "src/fns",
  "src/lib",
];
/** @param {string} value */
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Explicit capability roots keep framework adapters and shared folders out of domain boundaries.
 * @param {SourceStructure} [options]
 */
function createDomainIndex({
  domains = [],
  sharedRoots = LEGACY_SHARED_ROOTS,
  moves = [],
} = {}) {
  const roots = domains
    .map(({ path }) => path.replace(/\/$/, ""))
    .sort((a, b) => b.length - a.length);
  const shared = [...new Set([...LEGACY_SHARED_ROOTS, ...sharedRoots])];
  /** @type {(path: string) => boolean} */
  const frameworkPath = (path) =>
    /^(?:(?:app|pages)\/|src\/(?:pages\/|app\/api\/))/.test(path);
  /** @type {(path: string) => string | null} */
  const featureRoot = (path) => {
    if (frameworkPath(path)) return null;
    const root = roots.find(
      (root) => path === root || path.startsWith(`${root}/`),
    );
    if (root) return `${root}/`;
    return path.match(/^src\/(?:ee\/)?features\/[^/]+\//)?.[0] ?? null;
  };
  /** @type {(path: string) => boolean} */
  const isFeatureRoot = (path) =>
    featureRoot(`${path.replace(/\/$/, "")}/`) ===
    `${path.replace(/\/$/, "")}/`;
  /** @type {(path: string) => boolean} */
  const isShared = (path) =>
    shared.some((root) => path.startsWith(`${root}/`)) && !featureRoot(path);
  /** @type {(path: string) => boolean} */
  const isServerSurface = (path) => {
    const root = featureRoot(path);
    return !!root && /^(?:server\/index)\.tsx?$/.test(path.slice(root.length));
  };
  /** @type {(path: string) => boolean} */
  const isPublicSurface = (path) => {
    const root = featureRoot(path);
    return (
      !!root && /^(?:index|server\/index)\.tsx?$/.test(path.slice(root.length))
    );
  };
  /** @type {(path: string) => boolean} */
  const isPageSurface = (path) => {
    const root = featureRoot(path);
    return (
      !!root &&
      /^(?:index\.tsx?|[A-Z][A-Za-z0-9]*Page\.tsx)$/.test(
        path.slice(root.length),
      )
    );
  };
  /** @param {string} slug */
  const destinationForRoute = (slug) => {
    const old = `src/features/${slug}`;
    const move = moves.find(({ from }) => from === old);
    return move?.to ?? (roots.includes(`src/${slug}`) ? `src/${slug}` : old);
  };
  // Cruiser uses per-root rules so a parent capability cannot absorb its declared children.
  /** @param {string} root */
  const descendantPattern = (root) => {
    const children = roots.filter((child) => child.startsWith(`${root}/`));
    const exclusion = children.length
      ? `(?!(?:${children.map((child) => escapeRegex(child.slice(root.length + 1))).join("|")})(?:/|$))`
      : "";
    return `^${escapeRegex(root)}/${exclusion}`;
  };
  return {
    roots,
    sharedRoots: shared,
    featureRoot,
    isFeatureRoot,
    isShared,
    isServerSurface,
    isPublicSurface,
    isPageSurface,
    destinationForRoute,
    descendantPattern,
  };
}

const registryPath = resolve(__dirname, "../../source-structure.json");
const registry = existsSync(registryPath)
  ? JSON.parse(readFileSync(registryPath, "utf8"))
  : {};
module.exports = {
  createDomainIndex,
  escapeRegex,
  ...createDomainIndex(registry),
};
