import { env } from "@/src/env.mjs";
import { capturePublicShareChanged } from "@/src/features/posthog-analytics/server/publicShareEvents";

const { captureMock } = vi.hoisted(() => ({ captureMock: vi.fn() }));
vi.mock("@/src/features/posthog-analytics/ServerPosthog", () => ({
  getServerPosthog: () => ({ capture: captureMock }),
}));

describe("capturePublicShareChanged", () => {
  const originalRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  afterEach(() => {
    Object.assign(env, { NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: originalRegion });
    captureMock.mockReset();
  });

  it("sends the kind and the new state from a production Cloud region only", () => {
    Object.assign(env, { NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "DEV" });
    capturePublicShareChanged("user-1", { kind: "trace", isPublic: true });
    expect(captureMock).not.toHaveBeenCalled();

    Object.assign(env, { NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "EU" });
    capturePublicShareChanged("user-1", { kind: "session", isPublic: false });
    expect(captureMock).toHaveBeenCalledExactlyOnceWith({
      distinctId: "user-1",
      event: "public_share:changed",
      properties: { kind: "session", isPublic: false },
    });
  });
});
