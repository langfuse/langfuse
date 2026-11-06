export type MetadataColumnConfig = {
  key: string;
  label?: string;
  visible: boolean;
  /** Position among all table columns, including hidden columns. */
  position: number;
};

export const MAX_METADATA_COLUMNS = 20;
const METADATA_COLUMN_PREFIX = "metadata-key-";

export function getMetadataColumnId(key: string): string {
  // Column IDs are also CSS variable names for table widths. Fixed-width
  // UTF-16 units preserve literal keys without punctuation or collisions.
  let encoded = "";
  for (let index = 0; index < key.length; index++) {
    encoded += key.charCodeAt(index).toString(16).padStart(4, "0");
  }
  return `${METADATA_COLUMN_PREFIX}${encoded}`;
}

function isMetadataColumnId(id: string): boolean {
  return id.startsWith(METADATA_COLUMN_PREFIX);
}

function isWellFormedUtf16(key: string): boolean {
  for (const character of key) {
    const code = character.charCodeAt(0);
    // Iteration keeps surrogate pairs together; a lone surrogate stays one unit.
    if (character.length === 1 && code >= 0xd800 && code <= 0xdfff)
      return false;
  }
  return true;
}

/** Local storage is user-editable; retain only usable column definitions. */
export function parseMetadataColumnConfigs(
  value: unknown,
): MetadataColumnConfig[] {
  if (!Array.isArray(value)) return [];

  const result: MetadataColumnConfig[] = [];
  const keys = new Set<string>();
  for (const candidate of value as unknown[]) {
    if (
      candidate === null ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      continue;
    }
    const item = candidate as Record<string, unknown>;
    if (
      typeof item.key !== "string" ||
      item.key.length === 0 ||
      item.key.length > 1_000 ||
      !isWellFormedUtf16(item.key) ||
      keys.has(item.key) ||
      typeof item.visible !== "boolean" ||
      typeof item.position !== "number" ||
      !Number.isSafeInteger(item.position) ||
      item.position < 0 ||
      (item.label !== undefined &&
        (typeof item.label !== "string" || item.label.length > 200))
    ) {
      continue;
    }
    const label = item.label?.trim() ? item.label : undefined;
    result.push({
      key: item.key,
      ...(label ? { label } : {}),
      visible: item.visible,
      position: item.position,
    });
    keys.add(item.key);
    if (result.length === MAX_METADATA_COLUMNS) break;
  }
  return result;
}

export function stripMetadataColumnOrder(order: readonly string[]): string[] {
  return order.filter((id) => !isMetadataColumnId(id));
}

export function stripMetadataColumnVisibility(
  visibility: Record<string, boolean>,
): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(visibility).filter(([id]) => !isMetadataColumnId(id)),
  );
}

/** Metadata columns belong to this browser's layout, never to a shared view. */
export function stripMetadataColumnsFromView<
  T extends {
    columnOrder: string[];
    columnVisibility: Record<string, boolean>;
  },
>(state: T): T {
  return {
    ...state,
    columnOrder: stripMetadataColumnOrder(state.columnOrder),
    columnVisibility: stripMetadataColumnVisibility(state.columnVisibility),
  };
}

export function mergeMetadataColumnOrder(
  baseOrder: readonly string[],
  configs: readonly MetadataColumnConfig[],
): string[] {
  const order = stripMetadataColumnOrder(baseOrder);
  const positioned = [...configs].sort((a, b) => a.position - b.position);
  let previousPosition = -1;
  for (const config of positioned) {
    // Equal positions keep the configuration's relative order. Positions past
    // the end append, including when a saved view has fewer static columns.
    const position = Math.min(
      Math.max(config.position, previousPosition + 1),
      order.length,
    );
    order.splice(position, 0, getMetadataColumnId(config.key));
    previousPosition = position;
  }
  return order;
}

export function getMetadataColumnVisibility(
  configs: readonly MetadataColumnConfig[],
): Record<string, boolean> {
  return Object.fromEntries(
    configs.map((config) => [getMetadataColumnId(config.key), config.visible]),
  );
}

export function updateMetadataColumnOrder(
  configs: readonly MetadataColumnConfig[],
  displayOrder: readonly string[],
): MetadataColumnConfig[] {
  return configs.map((config) => {
    const position = displayOrder.indexOf(getMetadataColumnId(config.key));
    return position < 0 || position === config.position
      ? config
      : { ...config, position };
  });
}

export function updateMetadataColumnVisibility(
  configs: readonly MetadataColumnConfig[],
  visibility: Record<string, boolean>,
): MetadataColumnConfig[] {
  return configs.map((config) => {
    const id = getMetadataColumnId(config.key);
    const visible = Object.hasOwn(visibility, id) ? visibility[id] : undefined;
    return typeof visible !== "boolean" || visible === config.visible
      ? config
      : { ...config, visible };
  });
}

export function parseMetadataRecord(
  metadata: unknown,
): Record<string, unknown> | null {
  let parsed = metadata;
  if (typeof metadata === "string") {
    try {
      parsed = JSON.parse(metadata);
    } catch {
      return null;
    }
  }
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}

/** Dots are literal key characters; inherited properties are never metadata. */
export function getMetadataValue(
  metadata: Record<string, unknown> | null,
  key: string,
): unknown {
  return metadata !== null && Object.hasOwn(metadata, key)
    ? metadata[key]
    : undefined;
}
