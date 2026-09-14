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
