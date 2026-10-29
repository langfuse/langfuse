/**
 * Converts a DOM Selection to JSON path and character range.
 *
 * Relies on data-json-path and data-json-key-value attributes
 * added to AdvancedJsonViewer DOM elements.
 */

interface SelectionPathResult {
  dataField: "input" | "output" | "metadata";
  path: string[];
  rangeStart: number[];
  rangeEnd: number[];
  selectedText: string;
}

export function selectionToPath(
  selection: Selection,
  containerElement: HTMLElement,
  dataField: "input" | "output" | "metadata",
): SelectionPathResult | null {
  if (selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const selectedText = range.toString();

  if (!selectedText.trim()) {
    return null;
  }

  // Find JSON path and key-value element for start
  const startPath = findJsonPath(range.startContainer);
  const startKeyValue = findKeyValueElement(range.startContainer);

  // Find JSON path and key-value element for end
  const endPath = findJsonPath(range.endContainer);
  const endKeyValue = findKeyValueElement(range.endContainer);

  if (!startPath || !startKeyValue) {
    return null;
  }

  if (!endPath || !endKeyValue) {
    return null;
  }

  // Single row case: start and end in same key-value element
  if (startKeyValue === endKeyValue) {
    let startOffset = calculateOffset(
      range.startContainer,
      range.startOffset,
      startKeyValue,
    );
    let endOffset = calculateOffset(
      range.endContainer,
      range.endOffset,
      startKeyValue,
    );

    // Normalize: ensure start <= end (handle backwards selection)
    if (startOffset > endOffset) {
      [startOffset, endOffset] = [endOffset, startOffset];
    }

    return {
      dataField,
      path: [startPath],
      rangeStart: [startOffset],
      rangeEnd: [endOffset],
      selectedText,
    };
  }

  // Multi-row case: selection spans multiple key-value elements
  const rows = collectRowsBetween(startKeyValue, endKeyValue, containerElement);
  if (rows.length === 0) {
    return null;
  }

  // Determine if selection is backwards (user dragged up)
  const isBackwards = rows[0] !== startKeyValue;
  const [firstContainer, firstOffset] = isBackwards
    ? [range.endContainer, range.endOffset]
    : [range.startContainer, range.startOffset];
  const [lastContainer, lastOffset] = isBackwards
    ? [range.startContainer, range.startOffset]
    : [range.endContainer, range.endOffset];

  const paths: string[] = [];
  const rangeStarts: number[] = [];
  const rangeEnds: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowPath = row.dataset.jsonPath;
    if (!rowPath) continue; // Skip structural elements without path

    if (i === 0) {
      // First row: from selection start to end of row
      paths.push(rowPath);
      rangeStarts.push(calculateOffset(firstContainer, firstOffset, row));
      rangeEnds.push(getRowTextLength(row));
    } else if (i === rows.length - 1) {
      // Last row: from 0 to selection end
      paths.push(rowPath);
      rangeStarts.push(0);
      rangeEnds.push(calculateOffset(lastContainer, lastOffset, row));
    } else {
      // Middle rows: entire row (0 → end)
      paths.push(rowPath);
      rangeStarts.push(0);
      rangeEnds.push(getRowTextLength(row));
    }
  }

  if (paths.length === 0) {
    return null;
  }

  return {
    dataField,
    path: paths,
    rangeStart: rangeStarts,
    rangeEnd: rangeEnds,
    selectedText,
  };
}

function findJsonPath(node: Node): string | null {
  let current: Node | null = node;
  while (current && current !== document.body) {
    if (current instanceof HTMLElement && current.dataset.jsonPath) {
      return current.dataset.jsonPath;
    }
    current = current.parentNode;
  }
  return null;
}

function findKeyValueElement(node: Node): HTMLElement | null {
  let current: Node | null = node;
  while (current && current !== document.body) {
    if (current instanceof HTMLElement && current.dataset.jsonKeyValue) {
      return current;
    }
    current = current.parentNode;
  }
  return null;
}

function calculateOffset(
  container: Node,
  offset: number,
  keyValueElement: HTMLElement,
): number {
  const walker = document.createTreeWalker(
    keyValueElement,
    NodeFilter.SHOW_TEXT,
    null,
  );
  let charCount = 0;
  let node = walker.nextNode();

  while (node) {
    if (node === container) {
      return charCount + offset;
    }
    charCount += node.textContent?.length || 0;
    node = walker.nextNode();
  }

  return charCount + offset;
}

/**
 * Gets total text length of a key-value row element.
 */
function getRowTextLength(keyValueElement: HTMLElement): number {
  let length = 0;
  const walker = document.createTreeWalker(
    keyValueElement,
    NodeFilter.SHOW_TEXT,
    null,
  );
  let node = walker.nextNode();
  while (node) {
    length += node.textContent?.length || 0;
    node = walker.nextNode();
  }
  return length;
}

/**
 * Collects all row elements between startRow and endRow (inclusive).
 * Handles both forward and backward selections.
 */
function collectRowsBetween(
  startRow: HTMLElement,
  endRow: HTMLElement,
  container: HTMLElement,
): HTMLElement[] {
  const allRows = Array.from(
    container.querySelectorAll<HTMLElement>("[data-json-key-value]"),
  );

  const startIdx = allRows.indexOf(startRow);
  const endIdx = allRows.indexOf(endRow);

  if (startIdx === -1 || endIdx === -1) return [];

  // Handle backwards selection
  const [minIdx, maxIdx] =
    startIdx <= endIdx ? [startIdx, endIdx] : [endIdx, startIdx];

  return allRows.slice(minIdx, maxIdx + 1);
}
