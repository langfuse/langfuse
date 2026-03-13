/** @jest-environment node */

import { unflattenMetadataForTrpc } from "@/src/features/events/server/eventsRouter";

describe("events trpc", () => {
  describe("unflattenMetadataForTrpc", () => {
    it("should group dotted keys into nested objects", () => {
      expect(
        unflattenMetadataForTrpc({
          "scope.name": "api-server",
          "scope.region": "eu-central",
          environment: "prod",
        }),
      ).toEqual({
        scope: {
          name: "api-server",
          region: "eu-central",
        },
        environment: "prod",
      });
    });

    it("should treat literal dots in keys as path separators on the trpc boundary", () => {
      expect(
        unflattenMetadataForTrpc({
          "attributes.custom.request_id": "abc-123",
        }),
      ).toEqual({
        attributes: {
          custom: {
            request_id: "abc-123",
          },
        },
      });
    });

    it("should preserve a flat parent value when dotted child keys collide", () => {
      expect(
        unflattenMetadataForTrpc({
          scope: "literal-scope",
          "scope.name": "otel-scope-name",
        }),
      ).toEqual({
        scope: {
          name: "otel-scope-name",
        },
        __langfuse_conflicts: {
          scope: "literal-scope",
        },
      });
    });

    it("should preserve the same collision result regardless of key iteration order", () => {
      expect(
        unflattenMetadataForTrpc({
          "scope.name": "otel-scope-name",
          scope: "literal-scope",
        }),
      ).toEqual({
        scope: {
          name: "otel-scope-name",
        },
        __langfuse_conflicts: {
          scope: "literal-scope",
        },
      });
    });

    it("should keep the original flat value alongside multiple dotted descendants", () => {
      expect(
        unflattenMetadataForTrpc({
          scope: "literal-scope",
          "scope.name": "otel-scope-name",
          "scope.region": "eu-central",
        }),
      ).toEqual({
        scope: {
          name: "otel-scope-name",
          region: "eu-central",
        },
        __langfuse_conflicts: {
          scope: "literal-scope",
        },
      });
    });

    it("should preserve a flat object leaf and store a conflicting dotted value under the conflict bucket", () => {
      expect(
        unflattenMetadataForTrpc({
          scope: {
            name: "flat",
            team: "payments",
          },
          "scope.name": "dotted",
        }),
      ).toEqual({
        scope: {
          name: "flat",
          team: "payments",
        },
        __langfuse_conflicts: {
          "scope.name": "dotted",
        },
      });
    });

    it("should preserve the same object-leaf collision result regardless of key iteration order", () => {
      expect(
        unflattenMetadataForTrpc({
          "scope.name": "dotted",
          scope: {
            name: "flat",
            team: "payments",
          },
        }),
      ).toEqual({
        scope: {
          name: "flat",
          team: "payments",
        },
        __langfuse_conflicts: {
          "scope.name": "dotted",
        },
      });
    });
  });
});
