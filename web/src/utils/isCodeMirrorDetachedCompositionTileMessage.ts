/**
 * CodeMirror `@codemirror/view` IME composition cleanup. After compositionend,
 * a 50ms setTimeout calls `view.update([])`. `getCompositionContext` then does
 * `Tile.get(parent)` → `parent.cmTile`. When the composition node is detached,
 * parent is null and the engines throw a TypeError on `.cmTile`.
 *
 * Langfuse never reads `.cmTile` — it is a CodeMirror tile-tree expando.
 * Match the raw string, not a helper that strips a trailing `(…)` — WebKit's
 * signature is `null is not an object (evaluating 't.cmTile')`.
 */
export function isCodeMirrorDetachedCompositionTileMessage(
  value: string,
): boolean {
  const text = value.trim().replace(/\.$/, "").trim();
  return (
    /^Cannot read properties of null \(reading ['"]cmTile['"]\)$/.test(text) ||
    /^Cannot read property ['"]cmTile['"] of null$/.test(text) ||
    /^can't access property ["']cmTile["'] of null$/.test(text) ||
    /^null is not an object \(evaluating ['"][^'"]*\.cmTile['"]\)$/.test(text)
  );
}
