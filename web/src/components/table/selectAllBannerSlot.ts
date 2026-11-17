const SLOT_SELECTOR = "[data-select-all-banner-slot]";

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

/** DataTable calls this once its header slot is mounted. */
export function registerSelectAllBannerSlot(slot: HTMLElement) {
  if (!slot.isConnected) return () => undefined;
  notify();
  return () => {
    notify();
  };
}

export function subscribeSelectAllBannerSlots(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isDocumentPosition(node: Node, other: Node, flag: number) {
  const position = node.compareDocumentPosition(other);
  return Math.trunc(position / flag) % 2 === 1;
}

function followsHost(host: HTMLElement, slot: HTMLElement) {
  return isDocumentPosition(host, slot, Node.DOCUMENT_POSITION_FOLLOWING);
}

function commonAncestorDepth(host: HTMLElement, slot: HTMLElement) {
  const depthByNode = new Map<Node, number>();
  let node: Node | null = host;
  let depth = 0;
  while (node) {
    depthByNode.set(node, depth);
    node = node.parentNode;
    depth += 1;
  }

  node = slot;
  while (node) {
    const match = depthByNode.get(node);
    if (match !== undefined) return match;
    node = node.parentNode;
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * The banner slot that belongs to this toolbar: the earliest slot after the
 * toolbar, under the closest shared ancestor. Nested tables register later
 * slots and must not steal the banner.
 */
export function findSelectAllBannerSlot(host: HTMLElement): HTMLElement | null {
  const candidates = [
    ...document.querySelectorAll<HTMLElement>(SLOT_SELECTOR),
  ].filter(
    (slot) =>
      slot.isConnected && !host.contains(slot) && followsHost(host, slot),
  );

  let best: HTMLElement | null = null;
  let bestDepth = Number.POSITIVE_INFINITY;
  for (const slot of candidates) {
    const depth = commonAncestorDepth(host, slot);
    const earlier =
      best !== null &&
      isDocumentPosition(slot, best, Node.DOCUMENT_POSITION_FOLLOWING);
    if (depth < bestDepth || (depth === bestDepth && earlier)) {
      best = slot;
      bestDepth = depth;
    }
  }
  return best;
}
