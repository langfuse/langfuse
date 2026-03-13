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
  });
});
