const { routeConfigs, mockCreateAuthedProjectAPIRoute, mockWithMiddlewares } =
  vi.hoisted(() => {
    const routeConfigs: Array<{
      name: string;
      rateLimitResource?: string;
    }> = [];

    return {
      routeConfigs,
      mockCreateAuthedProjectAPIRoute: vi.fn((config) => {
        routeConfigs.push(config);
        return vi.fn();
      }),
      mockWithMiddlewares: vi.fn((handlers) => handlers),
    };
  });

vi.mock("@/src/features/public-api/server/createAuthedProjectAPIRoute", () => ({
  createAuthedProjectAPIRoute: mockCreateAuthedProjectAPIRoute,
}));

vi.mock("@/src/features/public-api/server/withMiddlewares", () => ({
  withMiddlewares: mockWithMiddlewares,
}));

vi.mock("@/src/features/media/server/mediaService", () => ({
  createMediaUploadUrl: vi.fn(),
  getMedia: vi.fn(),
  updateMediaUploadStatus: vi.fn(),
}));

vi.mock("@/src/env.mjs", () => ({
  env: {
    LANGFUSE_S3_MEDIA_MAX_CONTENT_LENGTH: 1_000_000,
  },
}));

vi.mock("@langfuse/shared", () => ({
  ForbiddenError: class ForbiddenError extends Error {},
  InvalidRequestError: class InvalidRequestError extends Error {},
}));

vi.mock("@langfuse/shared/src/server", () => ({
  ClickHouseClientManager: {
    getInstance: () => ({
      closeAllConnections: vi.fn(async () => undefined),
    }),
  },
  instrumentAsync: vi.fn(async (_options, fn) =>
    fn({
      setAttribute: vi.fn(),
    }),
  ),
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
  },
  redis: null,
}));

describe("media public API rate limit resources", () => {
  beforeEach(() => {
    routeConfigs.length = 0;
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("uses the media-upload budget for upload URL creation", async () => {
    await import("@/src/pages/api/public/media/index");

    expect(routeConfigs).toEqual([
      expect.objectContaining({
        name: "Get Media Upload URL",
        rateLimitResource: "media-upload",
      }),
    ]);
  });

  it("uses the media-upload budget for upload status updates", async () => {
    await import("@/src/pages/api/public/media/[mediaId]");

    expect(routeConfigs[0]).toEqual(
      expect.objectContaining({
        name: "Get Media data",
      }),
    );
    expect(routeConfigs[0]).not.toHaveProperty("rateLimitResource");
    expect(routeConfigs[1]).toEqual(
      expect.objectContaining({
        name: "Update Media Uploaded At",
        rateLimitResource: "media-upload",
      }),
    );
  });
});
