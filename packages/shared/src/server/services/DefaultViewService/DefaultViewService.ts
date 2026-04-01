import { prisma } from "../../../db";
import type {
  DefaultViewAssignments,
  DefaultViewScope,
  ResolvedDefault,
} from "./types";

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
  public static async getDefaultAssignments({
    projectId,
    viewName,
    userId,
  }: GetResolvedDefaultParams): Promise<DefaultViewAssignments> {
    const defaults = await prisma.defaultView.findMany({
      where: {
        projectId,
        viewName,
        OR: userId ? [{ userId }, { userId: null }] : [{ userId: null }],
      },
    });

    return {
      userDefaultViewId: userId
        ? (defaults.find((d) => d.userId === userId)?.viewId ?? null)
        : null,
      projectDefaultViewId:
        defaults.find((d) => d.userId === null)?.viewId ?? null,
    };
  }

  /**
   * Get the resolved default view for a given context.
   * Priority: user default > project default > null
   */
  public static async getResolvedDefault({
    projectId,
    viewName,
    userId,
  }: GetResolvedDefaultParams): Promise<ResolvedDefault | null> {
    const assignments = await DefaultViewService.getDefaultAssignments({
      projectId,
      viewName,
      userId,
    });

    if (assignments.userDefaultViewId) {
      return { viewId: assignments.userDefaultViewId, scope: "user" };
    }

    if (assignments.projectDefaultViewId) {
      return { viewId: assignments.projectDefaultViewId, scope: "project" };
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
