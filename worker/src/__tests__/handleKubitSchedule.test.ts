import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mock state ────────────────────────────────────────────────────────

const { mockAddBulk, mockGetInstance } = vi.hoisted(() => {
  const mockAddBulk = vi.fn().mockResolvedValue([]);
  const mockGetInstance = vi.fn().mockReturnValue({ addBulk: mockAddBulk });
  return { mockAddBulk, mockGetInstance };
});

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    kubitIntegration: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@langfuse/shared/src/server", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  KubitIntegrationProcessingQueue: { getInstance: mockGetInstance },
  QueueJobs: {
    KubitIntegrationProcessingJob: "KubitIntegrationProcessingJob",
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { handleKubitSchedule } from "../features/kubit/handleKubitSchedule";
import { prisma } from "@langfuse/shared/src/db";

// ── Helpers ───────────────────────────────────────────────────────────────────

const PROJECT_ID = "project-abc-123";

function integration(overrides: {
  lastSyncAt?: Date | null;
  syncIntervalMinutes?: number;
}) {
  return {
    projectId: PROJECT_ID,
    lastSyncAt: overrides.lastSyncAt ?? null,
    syncIntervalMinutes: overrides.syncIntervalMinutes ?? 60,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.restoreAllMocks();
  mockAddBulk.mockResolvedValue([]);
  mockGetInstance.mockReturnValue({ addBulk: mockAddBulk });
});

describe("handleKubitSchedule — due detection", () => {
  it("enqueues a project that has never synced (lastSyncAt = null)", async () => {
    vi.mocked(prisma.kubitIntegration.findMany).mockResolvedValue([
      integration({ lastSyncAt: null }),
    ]);

    await handleKubitSchedule();

    expect(mockAddBulk).toHaveBeenCalledOnce();
    expect(mockAddBulk.mock.calls[0][0]).toHaveLength(1);
  });

  it("enqueues a project whose full sync interval has elapsed", async () => {
    const lastSyncAt = new Date(Date.now() - 61 * 60 * 1000); // 61 min ago
    vi.mocked(prisma.kubitIntegration.findMany).mockResolvedValue([
      integration({ lastSyncAt, syncIntervalMinutes: 60 }),
    ]);

    await handleKubitSchedule();

    expect(mockAddBulk).toHaveBeenCalledOnce();
  });

  it("skips a project that is not yet due", async () => {
    const lastSyncAt = new Date(Date.now() - 30 * 60 * 1000); // 30 min ago
    vi.mocked(prisma.kubitIntegration.findMany).mockResolvedValue([
      integration({ lastSyncAt, syncIntervalMinutes: 60 }),
    ]);

    await handleKubitSchedule();

    expect(mockAddBulk).not.toHaveBeenCalled();
  });

  it("enqueues when elapsed time is exactly equal to the sync interval", async () => {
    const lastSyncAt = new Date(Date.now() - 60 * 60 * 1000); // exactly 60 min ago
    vi.mocked(prisma.kubitIntegration.findMany).mockResolvedValue([
      integration({ lastSyncAt, syncIntervalMinutes: 60 }),
    ]);

    await handleKubitSchedule();

    expect(mockAddBulk).toHaveBeenCalledOnce();
  });

  it("enqueues multiple due projects and skips non-due ones in the same tick", async () => {
    const dueAt = new Date(Date.now() - 61 * 60 * 1000);
    const notDueAt = new Date(Date.now() - 30 * 60 * 1000);
    vi.mocked(prisma.kubitIntegration.findMany).mockResolvedValue([
      { projectId: "proj-due", lastSyncAt: dueAt, syncIntervalMinutes: 60 },
      {
        projectId: "proj-not-due",
        lastSyncAt: notDueAt,
        syncIntervalMinutes: 60,
      },
    ]);

    await handleKubitSchedule();

    expect(mockAddBulk).toHaveBeenCalledOnce();
    expect(mockAddBulk.mock.calls[0][0]).toHaveLength(1);
    expect(mockAddBulk.mock.calls[0][0][0].data.payload.projectId).toBe(
      "proj-due",
    );
  });
});

describe("handleKubitSchedule — grace period (cron jitter)", () => {
  it("enqueues a project whose cron fired 2 seconds early due to job startup latency", async () => {
    // Simulates the real-world case: the cron fires at :15:00 but lastSyncAt
    // was set to :15:02 by the previous job (startup latency). Without the
    // 60-second grace period, now - lastSyncAt = 59min 58s < 60min and the
    // integration would be skipped, delaying sync by a full 15 minutes.
    const startupLatencyMs = 2_000;
    const lastSyncAt = new Date(
      Date.now() - 60 * 60 * 1000 + startupLatencyMs, // 59m 58s ago
    );
    vi.mocked(prisma.kubitIntegration.findMany).mockResolvedValue([
      integration({ lastSyncAt, syncIntervalMinutes: 60 }),
    ]);

    await handleKubitSchedule();

    expect(mockAddBulk).toHaveBeenCalledOnce();
  });

  it("enqueues a project whose cron fired 59 seconds early (within grace period)", async () => {
    const lastSyncAt = new Date(
      Date.now() - 60 * 60 * 1000 + 59_000, // 59m 1s ago
    );
    vi.mocked(prisma.kubitIntegration.findMany).mockResolvedValue([
      integration({ lastSyncAt, syncIntervalMinutes: 60 }),
    ]);

    await handleKubitSchedule();

    expect(mockAddBulk).toHaveBeenCalledOnce();
  });

  it("skips a project that is more than 60 seconds early (outside grace period)", async () => {
    const lastSyncAt = new Date(
      Date.now() - 60 * 60 * 1000 + 61_000, // 58m 59s ago — too early
    );
    vi.mocked(prisma.kubitIntegration.findMany).mockResolvedValue([
      integration({ lastSyncAt, syncIntervalMinutes: 60 }),
    ]);

    await handleKubitSchedule();

    expect(mockAddBulk).not.toHaveBeenCalled();
  });
});

describe("handleKubitSchedule — edge cases", () => {
  it("does nothing when there are no enabled integrations", async () => {
    vi.mocked(prisma.kubitIntegration.findMany).mockResolvedValue([]);

    await handleKubitSchedule();

    expect(mockAddBulk).not.toHaveBeenCalled();
  });

  it("throws when the processing queue is not initialized", async () => {
    mockGetInstance.mockReturnValue(null);
    vi.mocked(prisma.kubitIntegration.findMany).mockResolvedValue([
      integration({ lastSyncAt: null }),
    ]);

    await expect(handleKubitSchedule()).rejects.toThrow(
      "KubitIntegrationProcessingQueue not initialized",
    );
  });

  it("uses projectId and lastSyncAt as the jobId to prevent duplicate enqueues", async () => {
    const lastSyncAt = new Date(Date.now() - 61 * 60 * 1000);
    vi.mocked(prisma.kubitIntegration.findMany).mockResolvedValue([
      integration({ lastSyncAt, syncIntervalMinutes: 60 }),
    ]);

    await handleKubitSchedule();

    const jobs = mockAddBulk.mock.calls[0][0];
    expect(jobs[0].opts?.jobId).toBe(
      `${PROJECT_ID}-${lastSyncAt.toISOString()}`,
    );
  });
});
