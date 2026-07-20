/**
 * AsyncJsonSource — the child-source seam under the RowModel (LFE-11080/82).
 *
 * A source answers three async, nodeId-keyed questions: what's the root, page
 * this container's immediate children, materialize this node's value. This is
 * exactly the byte-indexer's surface, made async so ONE model
 * (`TreeRowModel`) works over either:
 *   - `createInProcessSource(bytes)` — the byte engine on the main thread
 *     (resolves immediately). The in-memory case routes through here too, via
 *     `sourceFromValue` (stringify → UTF-8 bytes → engine), so there is a single
 *     tree/preview/precision implementation, not two.
 *   - a Worker source (future, LFE-11081/82) — the engine behind postMessage,
 *     for the ~1 GB streamed path. Same interface, genuinely async.
 */

import {
  ByteJsonIndexEngine,
  type ChildrenPage,
  type GetValueResult,
  type NodeDescriptor,
} from "./byteJsonIndex";

export interface AsyncJsonSource {
  /** Root descriptor (available once the source is constructed). */
  readonly root: NodeDescriptor;
  /** Immediate children of `nodeId` in the window `[offset, offset+limit)`. */
  childrenPage(
    nodeId: number,
    offset: number,
    limit: number,
  ): Promise<ChildrenPage>;
  /** Materialize a single node's full value (bounded by the engine's cap). */
  getValue(nodeId: number, maxBytes?: number): Promise<GetValueResult>;
  /** Re-describe a node (e.g. a container after its child count is known). */
  describe(nodeId: number): NodeDescriptor;
}

/**
 * Wrap the synchronous byte engine as an AsyncJsonSource. Suitable for the main
 * thread; every call resolves immediately. The same class is what a Worker host
 * would drive, exposing the identical interface across `postMessage`.
 */
export function createInProcessSource(bytes: Uint8Array): AsyncJsonSource {
  const engine = new ByteJsonIndexEngine();
  const root = engine.load(bytes);
  return {
    root,
    childrenPage(nodeId, offset, limit) {
      return Promise.resolve(engine.childrenPage(nodeId, offset, limit));
    },
    getValue(nodeId, maxBytes) {
      return Promise.resolve(engine.getValue(nodeId, maxBytes));
    },
    describe(nodeId) {
      return engine.describeNode(nodeId);
    },
  };
}

const encoder = new TextEncoder();

/**
 * In-memory entry point: an AsyncJsonSource over an already-parsed JS value.
 * Per the spike's "unify on the byte engine" decision, we do NOT keep a second
 * in-memory tree engine — we serialize the value to UTF-8 bytes and feed the
 * same byte indexer. In-memory payloads are bounded (v3/parsed IO is well under
 * the streamed-GB regime), so `JSON.stringify` here is cheap, and any numeric
 * precision was already resolved upstream when the value was parsed.
 */
export function sourceFromValue(value: unknown): AsyncJsonSource {
  // `JSON.stringify(undefined)` is `undefined`; normalize to a valid document.
  const json = value === undefined ? "null" : (JSON.stringify(value) ?? "null");
  return createInProcessSource(encoder.encode(json));
}
