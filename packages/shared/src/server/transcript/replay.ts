import { isEnrichmentPart, type PreparedMessage } from "./messages";

type Occurrences = { shown: number; seen: number };

/** Match each input occurrence to one already-shown occurrence within a generation. */
export function createMessageDeduplicator(messages: PreparedMessage[]) {
  const identities = new Map<string, Occurrences>();
  const enrichments = new Map<string, Occurrences>();

  const countsFor = (
    counts: Map<string, Occurrences>,
    key: string | undefined,
  ) => {
    if (key === undefined) return undefined;
    const existing = counts.get(key);
    if (existing) return existing;
    const entry = { shown: 0, seen: 0 };
    counts.set(key, entry);
    return entry;
  };

  // Identity and enrichment parts may be replayed together or separately.
  for (const message of messages) {
    const identity = countsFor(identities, message.identityKey);
    const enrichment = countsFor(enrichments, message.enrichmentKey);
    if (identity) identity.shown++;
    if (enrichment) enrichment.shown++;
  }

  return (message: PreparedMessage) => {
    const whole = {
      parts: message.parts,
      identityKey: message.identityKey,
      enrichmentKey: message.enrichmentKey,
      isEnrichment: false,
    };
    if (message.source === "output") return whole;

    const identity = countsFor(identities, message.identityKey);
    const enrichment = countsFor(enrichments, message.enrichmentKey);
    const repeatsIdentity = !identity || ++identity.seen <= identity.shown;
    const repeatsEnrichment =
      !enrichment || ++enrichment.seen <= enrichment.shown;

    // Count retained enrichment before checking later input occurrences.
    if (enrichment && (!repeatsIdentity || !repeatsEnrichment))
      enrichment.shown++;
    if (!repeatsIdentity) return whole;
    if (!repeatsEnrichment)
      return {
        ...whole,
        parts: message.parts.filter(isEnrichmentPart),
        identityKey: undefined,
        isEnrichment: message.identityKey !== undefined,
      };
    return undefined;
  };
}
