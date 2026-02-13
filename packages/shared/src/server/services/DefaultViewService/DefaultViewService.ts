import { prisma } from "../../../db";
import type { DefaultViewScope, ResolvedDefault } from "./types";

interface GetResolvedDefaultParams {
  projectId: string;
  viewName: string;
  userId?: string;
}

interface SetAsDefaultParams {
  projectId: string;
  viewId: string;
  viewName: string;
  scope: DefaultViewScope;
  userId?: string;
}

interface ClearDefaultParams {
  projectId: string;
  viewName: string;
  scope: DefaultViewScope;
  userId?: string;
}

export class DefaultViewService {
  /**
   * Get the resolved default view for a given context.
   * Priority: user default > project default > null
   */
  public static async getResolvedDefault({
    projectId,
    viewName,
    userId,
  }: GetResolvedDefaultParams): Promise<ResolvedDefault | null> {
    // Get all defaults for this project/viewName (both user and project level)
    const defaults = await prisma.defaultView.findMany({
      where: {
        projectId,
        viewName,
        OR: userId ? [{ userId }, { userId: null }] : [{ userId: null }],
      },
    });

    // Check for user-level default first (if userId provided)
    if (userId) {
      const userDefault = defaults.find((d) => d.userId === userId);
      if (userDefault) {
        return { viewId: userDefault.viewId, scope: "user" };
      }
    }

    // Fall back to project-level default
    const projectDefault = defaults.find((d) => d.userId === null);
    if (projectDefault) {
      return { viewId: projectDefault.viewId, scope: "project" };
    }

    return null;
  }

  /**
   * Set a view as the default for user or project level.
   * Upserts the default view record using serializable transaction to prevent races.
   */
  public static async setAsDefault({
    projectId,
    viewId,
    viewName,
    scope,
    userId,
  }: SetAsDefaultParams): Promise<void> {
    const userIdToUse = scope === "user" ? userId : null;

    if (scope === "user" && !userId) {
      throw new Error("userId is required for user-level defaults");
    }

    // Use serializable transaction to prevent race conditions
    // Two concurrent requests will be serialized, avoiding duplicate inserts
    await prisma.$transaction(
      async (tx) => {
        const existing = await tx.defaultView.findFirst({
          where: {
            projectId,
            viewName,
            userId: userIdToUse,
          },
        });

        if (existing) {
          await tx.defaultView.update({
            where: { id: existing.id },
            data: { viewId },
          });
        } else {
          await tx.defaultView.create({
            data: {
              projectId,
              userId: userIdToUse,
              viewName,
              viewId,
            },
          });
        }
      },
      { isolationLevel: "Serializable" },
    );
  }

  public static async clearDefault({
    projectId,
    viewName,
    scope,
    userId,
  }: ClearDefaultParams): Promise<void> {
    const userIdToUse = scope === "user" ? userId : null;

    if (scope === "user" && !userId) {
      throw new Error("userId is required for clearing user-level defaults");
    }

    await prisma.defaultView.deleteMany({
      where: {
        projectId,
        viewName,
        userId: userIdToUse,
      },
    });
  }
}
