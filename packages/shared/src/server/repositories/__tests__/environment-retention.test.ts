import { describe, it, expect, vi, beforeEach } from "vitest";
import { deleteTracesOlderThanDays } from "../traces";
import { deleteObservationsOlderThanDays } from "../observations";
import { deleteScoresOlderThanDays } from "../scores";
import { commandClickhouse } from "../clickhouse";

// Mock the ClickHouse command function
vi.mock("../clickhouse", () => ({
  commandClickhouse: vi.fn(),
}));

describe("Environment-specific retention deletion", () => {
  const mockProjectId = "test-project-id";
  const mockCutoffDate = new Date("2024-01-01");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("deleteTracesOlderThanDays", () => {
    it("should delete traces without environment filter when no environments specified", async () => {
      await deleteTracesOlderThanDays(mockProjectId, mockCutoffDate);

      expect(commandClickhouse).toHaveBeenCalledWith({
        query: expect.stringContaining("DELETE FROM traces"),
        params: {
          projectId: mockProjectId,
          cutoffDate: expect.any(String),
        },
        clickhouseConfigs: expect.any(Object),
        tags: expect.any(Object),
      });

      const call = (commandClickhouse as any).mock.calls[0][0];
      expect(call.query).not.toContain("environment IN");
    });

    it("should include environment filter when environments are specified", async () => {
      const environments = ["production", "staging"];
      await deleteTracesOlderThanDays(mockProjectId, mockCutoffDate, environments);

      expect(commandClickhouse).toHaveBeenCalledWith({
        query: expect.stringContaining("AND environment IN ({environments: Array(String)})"),
        params: {
          projectId: mockProjectId,
          cutoffDate: expect.any(String),
          environments,
        },
        clickhouseConfigs: expect.any(Object),
        tags: expect.any(Object),
      });
    });

    it("should not include environment filter when empty environments array is passed", async () => {
      await deleteTracesOlderThanDays(mockProjectId, mockCutoffDate, []);

      const call = (commandClickhouse as any).mock.calls[0][0];
      expect(call.query).not.toContain("environment IN");
      expect(call.params).not.toHaveProperty("environments");
    });
  });

  describe("deleteObservationsOlderThanDays", () => {
    it("should include environment filter for observations", async () => {
      const environments = ["production"];
      await deleteObservationsOlderThanDays(mockProjectId, mockCutoffDate, environments);

      expect(commandClickhouse).toHaveBeenCalledWith({
        query: expect.stringContaining("DELETE FROM observations"),
        params: {
          projectId: mockProjectId,
          cutoffDate: expect.any(String),
          environments,
        },
        clickhouseConfigs: expect.any(Object),
        tags: expect.any(Object),
      });

      const call = (commandClickhouse as any).mock.calls[0][0];
      expect(call.query).toContain("AND environment IN ({environments: Array(String)})");
    });
  });

  describe("deleteScoresOlderThanDays", () => {
    it("should include environment filter for scores", async () => {
      const environments = ["development", "testing"];
      await deleteScoresOlderThanDays(mockProjectId, mockCutoffDate, environments);

      expect(commandClickhouse).toHaveBeenCalledWith({
        query: expect.stringContaining("DELETE FROM scores"),
        params: {
          projectId: mockProjectId,
          cutoffDate: expect.any(String),
          environments,
        },
        clickhouseConfigs: expect.any(Object),
        tags: expect.any(Object),
      });

      const call = (commandClickhouse as any).mock.calls[0][0];
      expect(call.query).toContain("AND environment IN ({environments: Array(String)})");
    });
  });
});
