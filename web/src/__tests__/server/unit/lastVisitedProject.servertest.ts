const redisMock = vi.hoisted(() => ({
  status: "ready",
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", () => ({
  redis: redisMock,
  logger: { warn: vi.fn() },
}));

import {
  forgetLastVisitedProject,
  readLastVisitedProject,
  recordLastVisitedProject,
} from "@/src/features/projects/server/lastVisitedProject";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

it("bounds pending Redis operations to the 250ms navigation budget and recovers on the next read", async () => {
  vi.useFakeTimers();
  redisMock.get.mockImplementation(() => new Promise(() => {}));
  redisMock.set.mockImplementation(() => new Promise(() => {}));
  redisMock.del.mockImplementation(() => new Promise(() => {}));
  let outcome: unknown = "pending";
  const completed = Promise.all([
    readLastVisitedProject("user-1"),
    recordLastVisitedProject({ userId: "user-1", projectId: "project-1" }),
    forgetLastVisitedProject("user-1"),
  ]).then((result) => {
    outcome = result;
  });

  await vi.advanceTimersByTimeAsync(250);

  expect(outcome).toEqual([null, undefined, undefined]);
  await completed;
  redisMock.get.mockResolvedValue("project-2");
  await expect(readLastVisitedProject("user-1")).resolves.toBe("project-2");
  expect(vi.getTimerCount()).toBe(0);
});
