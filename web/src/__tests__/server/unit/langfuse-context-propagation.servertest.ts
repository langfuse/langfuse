import * as opentelemetry from "@opentelemetry/api";
import type { Span } from "@opentelemetry/api";
import {
  addUserToSpan,
  contextWithLangfuseProps,
} from "@langfuse/shared/src/server";

describe("Langfuse context propagation", () => {
  it("adds api key metadata to span attributes and baggage", () => {
    const span = {
      setAttribute: vi.fn(),
    } as unknown as Span;

    opentelemetry.context.with(opentelemetry.ROOT_CONTEXT, () => {
      const ctx = addUserToSpan(
        {
          projectId: "project-1",
          orgId: "org-1",
          plan: "cloud:hobby",
          apiKeyId: "api-key-1",
          publicKey: "pk-lf-1",
        },
        span,
      );

      expect(span.setAttribute).toHaveBeenCalledWith(
        "langfuse.api_key.id",
        "api-key-1",
      );
      expect(
        opentelemetry.propagation
          .getBaggage(ctx!)
          ?.getEntry("langfuse.api_key.id")?.value,
      ).toBe("api-key-1");
      expect(span.setAttribute).toHaveBeenCalledWith(
        "langfuse.api_key.public_key",
        "pk-lf-1",
      );
      expect(
        opentelemetry.propagation
          .getBaggage(ctx!)
          ?.getEntry("langfuse.api_key.public_key")?.value,
      ).toBe("pk-lf-1");
    });
  });

  it("adds api key id to request context baggage", () => {
    opentelemetry.context.with(opentelemetry.ROOT_CONTEXT, () => {
      const ctx = contextWithLangfuseProps({
        projectId: "project-1",
        apiKeyId: "api-key-1",
      });

      const baggage = opentelemetry.propagation.getBaggage(ctx);

      expect(baggage?.getEntry("langfuse.project.id")?.value).toBe("project-1");
      expect(baggage?.getEntry("langfuse.api_key.id")?.value).toBe("api-key-1");
    });
  });
});
