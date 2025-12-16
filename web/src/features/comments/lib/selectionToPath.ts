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

  // Find JSON path from data attributes
  const startPath = findJsonPath(range.startContainer);
  if (!startPath) {
    console.log("[selectionToPath] No JSON path found for start container");
    return null;
  }

  // Calculate offset within the formatted key-value pair
  const keyValueElement = findKeyValueElement(range.startContainer);
  if (!keyValueElement) {
    console.log("[selectionToPath] No key-value element found");
    return null;
  }

  const startOffset = calculateOffset(
    range.startContainer,
    range.startOffset,
    keyValueElement,
  );
  const endOffset = calculateOffset(
    range.endContainer,
    range.endOffset,
    keyValueElement,
  );

  console.log("[selectionToPath] Result:", {
    dataField,
    path: [startPath],
    rangeStart: [startOffset],
    rangeEnd: [endOffset],
    selectedText,
  });

  return {
    dataField,
    path: [startPath],
    rangeStart: [startOffset],
    rangeEnd: [endOffset],
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
