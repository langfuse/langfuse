import type { EncodedOtelLookups } from "@langfuse/native";
import type { SkillsAvailable, SkillsResourceLoaded } from "@langfuse/shared";

/** What the worker resolved for one lookup request, or why it could not. */
export type OtelLookupResult =
  | { error: string }
  | {
      promptId?: string | null;
      model?: { id: string } | null;
      pricingTiers?: readonly OtelLookupPricingTier[];
      skillsAvailable?: SkillsAvailable;
      skillsResourceLoaded?: SkillsResourceLoaded;
    };

type OtelLookupPricingTier = {
  id: string;
  name: string;
  isDefault: boolean;
  priority: number;
  /** Stored as free-form JSON, so it is handed over as JSON text. */
  conditions?: unknown;
  prices: readonly { usageType: string; price: string }[];
};

/** Written first; the addon rejects any other version. Both sides change together. */
const FORMAT_VERSION = 1;

/**
 * Encode lookup results for `RustOtelBatch.complete`, one per lookup request.
 *
 * The addon reads a JavaScript object with one call per property on the main
 * thread. Here every text field is appended to one string and every count,
 * flag and number to one array, in the order `otel_pipeline/lookups.rs` reads
 * them, so the results cross in three values however many there are.
 */
export function encodeOtelLookups(
  lookups: readonly OtelLookupResult[],
): EncodedOtelLookups {
  const writer = new FlatWriter();
  writer.number(FORMAT_VERSION);
  writer.number(lookups.length);
  for (const lookup of lookups) {
    if ("error" in lookup) {
      writer.flag(false);
      writer.text(lookup.error);
      continue;
    }
    writer.flag(true);
    writer.text(lookup.promptId ?? "");
    writer.flag(lookup.promptId != null);
    writer.text(lookup.model?.id ?? "");
    writer.flag(lookup.model != null);

    const tiers = lookup.pricingTiers ?? [];
    writer.number(tiers.length);
    for (const tier of tiers) {
      writer.text(tier.id);
      writer.text(tier.name);
      writer.flag(tier.isDefault);
      writer.number(tier.priority);
      const conditions: string | undefined = JSON.stringify(tier.conditions);
      writer.text(conditions ?? "");
      writer.flag(conditions !== undefined);
      writer.number(tier.prices.length);
      for (const price of tier.prices) {
        writer.text(price.usageType);
        writer.text(price.price);
      }
    }

    const available = lookup.skillsAvailable ?? [];
    writer.number(available.length);
    for (const skill of available) {
      writeSkill(writer, skill);
    }
    const loaded = lookup.skillsResourceLoaded ?? [];
    writer.number(loaded.length);
    for (const skill of loaded) {
      writeSkill(writer, skill);
      writer.text(skill.filePath);
    }
  }
  return writer.finish();
}

function writeSkill(writer: FlatWriter, skill: SkillsAvailable[number]): void {
  writer.text(skill.langfuseSkillId ?? "");
  writer.flag(skill.langfuseSkillId != null);
  writer.number(skill.skillVersion ?? 0);
  writer.flag(skill.skillVersion != null);
  writer.text(skill.skillName);
}

class FlatWriter {
  private pieces = "";
  private lengths = new Uint32Array(64);
  private lengthCount = 0;
  private numbers = new Float64Array(64);
  private numberCount = 0;

  text(value: string): void {
    if (this.lengthCount === this.lengths.length) {
      const grown = new Uint32Array(this.lengths.length * 2);
      grown.set(this.lengths);
      this.lengths = grown;
    }
    this.lengths[this.lengthCount++] = value.length;
    // The line feed keeps two halves of a surrogate pair, left in adjacent
    // fields, from joining into one character whose length the addon would
    // then count differently.
    this.pieces += value;
    this.pieces += "\n";
  }

  number(value: number): void {
    if (this.numberCount === this.numbers.length) {
      const grown = new Float64Array(this.numbers.length * 2);
      grown.set(this.numbers);
      this.numbers = grown;
    }
    this.numbers[this.numberCount++] = value;
  }

  flag(value: boolean): void {
    this.number(value ? 1 : 0);
  }

  finish(): EncodedOtelLookups {
    return {
      text: this.pieces,
      lengths: this.lengths.subarray(0, this.lengthCount),
      numbers: this.numbers.subarray(0, this.numberCount),
    };
  }
}
