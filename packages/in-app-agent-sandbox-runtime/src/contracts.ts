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

const BashSandboxOperationSchema = z.object({
  operation: z.literal("bash"),
  command: z.string(),
  timeoutMs: z.number().finite().optional(),
  /** Extra process environment for this command only. Values are never logged. */
  env: z.record(z.string(), z.string()).optional(),
  /** Caller-chosen id that `POST /sandbox/cancel` can target while the command runs. */
  commandId: z.string().min(1).optional(),
  toolCallFiles: z.array(SandboxFileSchema).optional(),
});

/** Body of `POST /sandbox/cancel`, which bypasses the per-operation queue. */
export const CancelSandboxCommandSchema = z.object({
  commandId: z.string().min(1),
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
