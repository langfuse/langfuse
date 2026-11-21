import { z } from "zod";

export const SandboxFileSchema = z.object({
  path: z.string(),
  content: z.string(),
});

const ReadSandboxOperationSchema = z.object({
  operation: z.literal("read"),
  path: z.string(),
  toolCallFiles: z.array(SandboxFileSchema).optional(),
});

const WriteSandboxOperationSchema = z.object({
  operation: z.literal("write"),
  path: z.string(),
  content: z.string(),
  toolCallFiles: z.array(SandboxFileSchema).optional(),
});

const EditSandboxOperationSchema = z.object({
  operation: z.literal("edit"),
  path: z.string(),
  oldText: z.string(),
  newText: z.string(),
  toolCallFiles: z.array(SandboxFileSchema).optional(),
});

// Matches the worker's bash tool limit. Checked here too so the sandbox never
// arms a timer of arbitrary length; Node also clamps delays above 2^31-1 to 1ms.
const MAX_BASH_TIMEOUT_MS = 120_000;

const BashSandboxOperationSchema = z.object({
  operation: z.literal("bash"),
  command: z.string(),
  timeoutMs: z.number().int().positive().max(MAX_BASH_TIMEOUT_MS).optional(),
  toolCallFiles: z.array(SandboxFileSchema).optional(),
});

export const SandboxOperationSchema = z.discriminatedUnion("operation", [
  ReadSandboxOperationSchema,
  WriteSandboxOperationSchema,
  EditSandboxOperationSchema,
  BashSandboxOperationSchema,
]);

export type SandboxFile = z.infer<typeof SandboxFileSchema>;

export type ReadSandboxOperation = z.infer<typeof ReadSandboxOperationSchema>;
export type WriteSandboxOperation = z.infer<typeof WriteSandboxOperationSchema>;
export type EditSandboxOperation = z.infer<typeof EditSandboxOperationSchema>;
export type BashSandboxOperation = z.infer<typeof BashSandboxOperationSchema>;
export type SandboxOperation = z.infer<typeof SandboxOperationSchema>;
