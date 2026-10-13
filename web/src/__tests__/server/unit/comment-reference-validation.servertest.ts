import { LangfuseNotFoundError } from "@langfuse/shared";
import { validateCommentReferenceObject } from "@/src/features/comments/validateCommentReferenceObject";

const mocks = vi.hoisted(() => ({
  getObservationById: vi.fn(),
  getObservationByIdFromEventsTable: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", () => ({
  getObservationById: mocks.getObservationById,
  getObservationByIdFromEventsTable: mocks.getObservationByIdFromEventsTable,
}));

const input = {
  projectId: "comment-project",
  objectId: "root-observation",
  objectType: "OBSERVATION" as const,
  content: "Review this observation",
  objectStartTime: new Date("2026-09-18T10:00:00.000Z"),
};
const v4Context = { session: { user: { v4BetaEnabled: true } } };

describe("comment reference validation", () => {
  beforeEach(() => {
    mocks.getObservationById.mockReset();
    mocks.getObservationByIdFromEventsTable.mockReset();
    mocks.getObservationById.mockRejectedValue(
      new LangfuseNotFoundError("Observation not found"),
    );
  });

  it.each(["root-observation", "t-mirrored-trace"])(
    "accepts the v4 observation %s without a legacy observation row",
    async (objectId) => {
      mocks.getObservationByIdFromEventsTable.mockResolvedValue({
        id: objectId,
      });

      await expect(
        validateCommentReferenceObject({
          ctx: v4Context,
          input: { ...input, objectId },
        }),
      ).resolves.toEqual({});

      expect(
        mocks.getObservationByIdFromEventsTable,
      ).toHaveBeenCalledExactlyOnceWith({
        id: objectId,
        projectId: input.projectId,
        startTime: input.objectStartTime,
      });
      expect(mocks.getObservationById).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      name: "legacy session",
      ctx: { session: { user: { v4BetaEnabled: false } } },
    },
    {
      name: "public API context",
      ctx: { auth: { scope: { projectId: input.projectId } } },
    },
  ])("retains the routing wrapper for $name", async ({ ctx }) => {
    mocks.getObservationById.mockResolvedValue({ id: input.objectId });

    await expect(
      validateCommentReferenceObject({ ctx, input }),
    ).resolves.toEqual({});

    expect(mocks.getObservationById).toHaveBeenCalledExactlyOnceWith({
      id: input.objectId,
      projectId: input.projectId,
      startTime: input.objectStartTime,
    });
    expect(mocks.getObservationByIdFromEventsTable).not.toHaveBeenCalled();
  });

  it("retries a stale start-time hint on the same v4 read path", async () => {
    mocks.getObservationByIdFromEventsTable
      .mockRejectedValueOnce(new LangfuseNotFoundError("Observation not found"))
      .mockResolvedValueOnce({ id: input.objectId });

    await expect(
      validateCommentReferenceObject({ ctx: v4Context, input }),
    ).resolves.toEqual({});

    expect(mocks.getObservationByIdFromEventsTable.mock.calls).toEqual([
      [
        {
          id: input.objectId,
          projectId: input.projectId,
          startTime: input.objectStartTime,
        },
      ],
      [{ id: input.objectId, projectId: input.projectId }],
    ]);
    expect(mocks.getObservationById).not.toHaveBeenCalled();
  });

  it("propagates a v4 lookup failure without retrying or changing read paths", async () => {
    const error = new Error("Lookup timed out");
    mocks.getObservationByIdFromEventsTable.mockRejectedValue(error);

    await expect(
      validateCommentReferenceObject({ ctx: v4Context, input }),
    ).rejects.toBe(error);

    expect(mocks.getObservationByIdFromEventsTable).toHaveBeenCalledTimes(1);
    expect(mocks.getObservationById).not.toHaveBeenCalled();
  });
});
