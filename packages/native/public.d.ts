import type { PreparedEvent as NativePreparedEvent } from "./index.js";

export * from "./index.js";

/** Rust finalizes the row before handing its immutable handle to JavaScript. */
export declare class PreparedEvent extends NativePreparedEvent {
  private constructor();
}
