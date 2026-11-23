/**
 * Serialize lookup results for `RustOtelBatch.complete`. The spans of one batch
 * mostly share a few results (the same model and prices), so each distinct
 * result is written once and `indexes` names the result of every lookup.
 *
 * One JSON string is far cheaper for the main thread than letting the addon
 * convert every nested lookup value on its own.
 */
export function serializeOtelLookups(lookups: readonly object[]): string {
  const positions = new Map<string, number>();
  const indexes = lookups.map((lookup) => {
    const json = JSON.stringify(lookup);
    let position = positions.get(json);
    if (position === undefined) {
      position = positions.size;
      positions.set(json, position);
    }
    return position;
  });
  return `{"results":[${[...positions.keys()].join(",")}],"indexes":[${indexes.join(",")}]}`;
}
