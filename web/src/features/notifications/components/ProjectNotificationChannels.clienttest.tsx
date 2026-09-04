import { ProjectNotificationEventTypeSchema } from "@langfuse/shared";

import { NOTIFIED_EVENTS } from "@/src/features/notifications/components/ProjectNotificationChannels";

describe("NOTIFIED_EVENTS", () => {
  it("has exactly one entry per ProjectNotificationEventTypeSchema member", () => {
    expect(NOTIFIED_EVENTS.map((event) => event.value).sort()).toEqual(
      [...ProjectNotificationEventTypeSchema.options].sort(),
    );
  });

  it("gives every entry a non-empty title and description", () => {
    for (const event of NOTIFIED_EVENTS) {
      expect(event.title).not.toBe("");
      expect(event.description).not.toBe("");
    }
  });
});
