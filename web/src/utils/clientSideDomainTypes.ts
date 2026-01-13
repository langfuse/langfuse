import { type MetadataDomain } from "@langfuse/shared";

/**
 * Metadata serialized as string for client-side consumption.
 * Required because SuperJSON cannot handle certain top-level keys like "property".
 *
 * Client-side code should use type guards to check if metadata is string or object.
 */
export type MetadataDomainClient = string | null | undefined;

/**
 * Helper type to transform domain types for frontend by stringifying metadata.
 * Use this for tRPC return types that need to be serialized.
 *
 * @example
 * type ScoreFrontend = WithStringifiedMetadata<ScoreDomain>;
 * // Result: ScoreDomain but with metadata: string | null | undefined
 */
export type WithStringifiedMetadata<
  T extends { metadata?: MetadataDomain | undefined },
> = Omit<T, "metadata"> & { metadata: MetadataDomainClient };

/**
 * Stringifies metadata field for frontend consumption.
 * Returns null if metadata is null/undefined or empty object.
 */
export const stringifyMetadata = (
  metadata: MetadataDomain | null | undefined,
): MetadataDomainClient => {
  if (!metadata) return null;
  return JSON.stringify(metadata);
};

/**
 * Converts domain object to client-side-safe version by stringifying metadata.
 * Use this in tRPC routes before returning data to frontend.
 *
 * @example
 * return toDomainWithStringifiedMetadata(score);
 */
export const toDomainWithStringifiedMetadata = <
  T extends { metadata?: MetadataDomain | undefined },
>(
  obj: T,
): WithStringifiedMetadata<T> => {
  const { metadata, ...rest } = obj;
  return {
    ...rest,
    metadata: stringifyMetadata(metadata),
  } as WithStringifiedMetadata<T>;
};

/**
 * Converts array of domain objects to client-side-safe versions.
 * Convenience helper for mapping over arrays.
 *
 * @example
 * return { scores: toDomainArrayWithStringifiedMetadata(scores) };
 */
export const toDomainArrayWithStringifiedMetadata = <
  T extends { metadata?: MetadataDomain | undefined },
>(
  arr: T[],
): WithStringifiedMetadata<T>[] => {
  return arr.map(toDomainWithStringifiedMetadata);
};
