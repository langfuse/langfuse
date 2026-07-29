import { type FilterState } from "@langfuse/shared";

export const MODERN_SESSION_OBSERVATION_IDENTITY_COLUMN =
  "observationTypeAndName";

export type ModernSessionObservationIdentity = {
  type: string;
  name: string;
};

const utf8Length = (value: string) => new TextEncoder().encode(value).length;

export const encodeModernSessionObservationIdentity = ({
  type,
  name,
}: ModernSessionObservationIdentity) =>
  `${utf8Length(type)}:${type}${utf8Length(name)}:${name}`;

const decodeLengthPrefixedValue = (
  bytes: Uint8Array,
  offset: number,
): { value: string; offset: number } | null => {
  const colon = bytes.indexOf(58, offset);
  if (colon === -1) return null;

  const length = Number(new TextDecoder().decode(bytes.slice(offset, colon)));
  if (!Number.isInteger(length) || length < 0) return null;

  const valueStart = colon + 1;
  const valueEnd = valueStart + length;
  if (valueEnd > bytes.length) return null;

  return {
    value: new TextDecoder().decode(bytes.slice(valueStart, valueEnd)),
    offset: valueEnd,
  };
};

export const decodeModernSessionObservationIdentity = (
  identity: string,
): ModernSessionObservationIdentity | null => {
  const bytes = new TextEncoder().encode(identity);
  const type = decodeLengthPrefixedValue(bytes, 0);
  if (!type) return null;
  const name = decodeLengthPrefixedValue(bytes, type.offset);
  if (!name || name.offset !== bytes.length) return null;
  return { type: type.value, name: name.value };
};

export const splitModernSessionObservationFilters = (filters: FilterState) => {
  const exclusions: ModernSessionObservationIdentity[] = [];
  const regularFilters: FilterState = [];

  for (const filter of filters) {
    if (
      filter.column !== MODERN_SESSION_OBSERVATION_IDENTITY_COLUMN ||
      filter.type !== "stringOptions" ||
      filter.operator !== "none of"
    ) {
      regularFilters.push(filter);
      continue;
    }

    for (const value of filter.value) {
      const exclusion = decodeModernSessionObservationIdentity(value);
      if (exclusion) exclusions.push(exclusion);
    }
  }

  return { regularFilters, exclusions };
};

export const combineModernSessionObservationFilters = (
  regularFilters: FilterState,
  exclusions: ModernSessionObservationIdentity[],
): FilterState => {
  if (exclusions.length === 0) return regularFilters;

  return regularFilters.concat({
    column: MODERN_SESSION_OBSERVATION_IDENTITY_COLUMN,
    type: "stringOptions",
    operator: "none of",
    value: Array.from(
      new Set(exclusions.map(encodeModernSessionObservationIdentity)),
    ),
  });
};

export const addModernSessionObservationExclusion = (
  filters: FilterState,
  exclusion: ModernSessionObservationIdentity,
): FilterState => {
  const { regularFilters, exclusions } =
    splitModernSessionObservationFilters(filters);
  if (
    exclusions.some(
      (current) =>
        current.type === exclusion.type && current.name === exclusion.name,
    )
  ) {
    return filters;
  }

  return combineModernSessionObservationFilters(
    regularFilters,
    exclusions.concat(exclusion),
  );
};
