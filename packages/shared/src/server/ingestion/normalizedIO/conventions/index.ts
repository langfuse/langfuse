import type { IOConvention } from "./IOConvention";
import * as providers from "./providers";

export type {
  ConventionResult,
  IOConvention,
  MessageEnvelopeContext,
  PartHandlerContext,
  PartHandler,
  RootMessageSource,
  SiblingPartContribution,
  SiblingPartSlot,
  ToolDefinitionCarrier,
  ToolDefinitionOptions,
  ToolDefinitionSource,
} from "./IOConvention";
export { claimed, dropped, unmatched } from "./IOConvention";

/**
 * All registered provider conventions, derived from the `providers.ts`
 * barrel — adding a provider is one export line there, never an edit here.
 * `registry.test.ts` asserts folder <-> registry parity.
 *
 * Eager: provider files depend on canonical part builders and JSON helpers,
 * never on `normalize/message.ts`, `normalize/part.ts`, or the accumulator
 * collector,
 * which import this registry,
 * so there is no import cycle to protect against.
 */
export const registeredProviders: readonly IOConvention[] =
  Object.values(providers);
