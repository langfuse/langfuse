import z from "zod/v4";

export const DefaultViewScope = z.enum(["user", "project"]);
export type DefaultViewScope = z.infer<typeof DefaultViewScope>;

export const SetDefaultViewInput = z.object({
  projectId: z.string(),
  viewId: z.string(),
  viewName: z.string().optional(),
  scope: DefaultViewScope,
});
export type SetDefaultViewInput = z.infer<typeof SetDefaultViewInput>;

export const ClearDefaultViewInput = z.object({
  projectId: z.string(),
  viewName: z.string(),
  scope: DefaultViewScope,
});
export type ClearDefaultViewInput = z.infer<typeof ClearDefaultViewInput>;

export const GetDefaultViewInput = z.object({
  projectId: z.string(),
  viewName: z.string(),
});
export type GetDefaultViewInput = z.infer<typeof GetDefaultViewInput>;

export interface ResolvedDefault {
  viewId: string;
  scope: DefaultViewScope;
}
