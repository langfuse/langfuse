/**
 * ChildProvider — the lazy seam for the JSON tree (LFE-11080).
 *
 * The tree must never materialize more than what is expanded/visible. A
 * ChildProvider supplies a container's IMMEDIATE children on demand, one page
 * at a time — the tree calls it when a node is expanded (or scrolled), never up
 * front. This is the single abstraction that lets the same tree/navigation/
 * search UI run over different data sources:
 *
 *   - in-memory (this file): children come from an already-parsed JS value.
 *   - byte-index (LFE-11081/82, future): a Worker returns children by scanning
 *     only that container's bytes in the source ArrayBuffer — no full parse.
 *
 * Both implement `ChildProvider`, so the tree code is source-agnostic.
 *
 * Pagination is first-class because a single wide container (e.g. an array with
 * millions of siblings) is itself an O(N) failure mode: callers request a
 * bounded window `[offset, offset+limit)` and page further on demand.
 */

import type { JSONType } from "../types";
import { getJSONType, isExpandable, getChildCount } from "./jsonTypes";

/**
 * Default page size for a container's children. A container wider than this is
 * revealed in pages rather than all at once, so no single expand materializes
 * an unbounded number of rows.
 */
export const CHILD_PAGE_SIZE = 100;

/** A single immediate child of a container, described shallowly (no recursion
 *  into its own children — those are fetched lazily if/when it is expanded). */
export interface ChildDescriptor {
  /** Key in the parent: object property name, or array index. */
  key: string | number;
  /** The child value. For the in-memory provider this is the real value; a
   *  byte-index provider would return a lazy handle resolved on materialization. */
  value: unknown;
  type: JSONType;
  /** Whether this child can itself be expanded (object/array). */
  isExpandable: boolean;
  /** Immediate child count of THIS child (shallow peek; 0 for primitives). */
  childCount: number;
}

/** One bounded window of a container's immediate children. */
export interface ChildPage {
  children: ChildDescriptor[];
  /** Start index of this window within the container. */
  offset: number;
  /** Total immediate children in the container (across all pages). */
  total: number;
  /** Whether more children exist beyond this window. */
  hasMore: boolean;
}

/**
 * Supplies a container's immediate children on demand. Kept intentionally small
 * so a Worker/byte-index implementation can satisfy the same contract.
 */
export interface ChildProvider {
  /**
   * Return the immediate children of `parentValue` in the window
   * `[offset, offset+limit)`. `limit <= 0` means "the default page size".
   * Non-expandable values return an empty page.
   */
  getChildPage(parentValue: unknown, offset: number, limit: number): ChildPage;
}

function describe(key: string | number, value: unknown): ChildDescriptor {
  const type = getJSONType(value);
  const expandable = type === "object" || type === "array";
  return {
    key,
    value,
    type,
    isExpandable: expandable,
    // Shallow peek only — never recurses past the immediate child.
    childCount: expandable ? getChildCount(value) : 0,
  };
}

/**
 * ChildProvider backed by an already-parsed JS value. Pagination keeps a wide
 * container's per-expand work bounded: arrays slice in O(limit); objects pay
 * one O(N) `Object.keys` (unavoidable in-memory to know the key set) then slice
 * the page. The byte-index provider will avoid even that via its offset index.
 */
export function createInMemoryChildProvider(): ChildProvider {
  return {
    getChildPage(parentValue, offset, limit) {
      const pageLimit = limit > 0 ? limit : CHILD_PAGE_SIZE;
      const start = Math.max(0, offset);

      if (!isExpandable(parentValue)) {
        return { children: [], offset: start, total: 0, hasMore: false };
      }

      if (Array.isArray(parentValue)) {
        const total = parentValue.length;
        const end = Math.min(total, start + pageLimit);
        const children: ChildDescriptor[] = [];
        for (let i = start; i < end; i++) {
          children.push(describe(i, parentValue[i]));
        }
        return { children, offset: start, total, hasMore: end < total };
      }

      // object
      const keys = Object.keys(parentValue as Record<string, unknown>);
      const total = keys.length;
      const end = Math.min(total, start + pageLimit);
      const obj = parentValue as Record<string, unknown>;
      const children: ChildDescriptor[] = [];
      for (let i = start; i < end; i++) {
        const key = keys[i]!;
        children.push(describe(key, obj[key]));
      }
      return { children, offset: start, total, hasMore: end < total };
    },
  };
}
