import { AsyncLocalStorage } from "node:async_hooks";

const customerDataLoggingSuppressed = new AsyncLocalStorage<boolean>();

/**
 * Run an operation without emitting logs or trace error details that may carry
 * customer-controlled data. The scope follows async work created by the
 * callback, including timers and retry handlers.
 */
export function withCustomerDataLoggingSuppressed<T>(callback: () => T): T {
  return customerDataLoggingSuppressed.run(true, callback);
}

export function isCustomerDataLoggingSuppressed(): boolean {
  return customerDataLoggingSuppressed.getStore() === true;
}
