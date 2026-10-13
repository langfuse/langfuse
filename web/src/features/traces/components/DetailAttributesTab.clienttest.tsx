/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { DetailAttributesTab } from "./DetailAttributesTab";
import { MediaContentType } from "@langfuse/shared";
import { MediaEnabledFields } from "@/src/features/media/validation";

vi.mock("@/src/components/ui/PrettyJsonView", () => ({
  PrettyJsonView: vi.fn(() => null),
}));
vi.mock("./ObservationDetailView/AttributeRowActions", () => ({
  AttributeRowActions: () => null,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DetailAttributesTab metadata expansion", () => {
  it("forwards only metadata attachments", () => {
    const attachment = {
      mediaId: "media-id",
      contentType: MediaContentType.TXT,
      contentLength: 1,
      url: "https://example.com/media.txt",
      urlExpiry: "2099-01-01T00:00:00.000Z",
      field: MediaEnabledFields.Metadata,
    };
    render(
      <DetailAttributesTab
        metadata={{ file: "attachment" }}
        objectId="trace"
        projectId="project"
        currentView="pretty"
        media={[
          attachment,
          {
            ...attachment,
            mediaId: "input-media",
            field: MediaEnabledFields.Input,
          },
        ]}
      />,
    );
    expect(vi.mocked(PrettyJsonView).mock.calls[0]?.[0].media).toEqual([
      attachment,
    ]);
  });
  it.each(["pretty", "json"] as const)(
    "restores and saves %s expansion",
    (currentView) => {
      const onMetadataExpansionChange = vi.fn();
      const onJsonMetadataExpandedChange = vi.fn();
      const metadataExpansionState = { nested: false };
      render(
        <DetailAttributesTab
          metadata={{ nested: { value: 1 } }}
          objectId="trace"
          projectId="project"
          currentView={currentView}
          metadataExpansionState={metadataExpansionState}
          onMetadataExpansionChange={onMetadataExpansionChange}
          jsonMetadataExpanded={false}
          onJsonMetadataExpandedChange={onJsonMetadataExpandedChange}
        />,
      );
      const props = vi.mocked(PrettyJsonView).mock.calls[0]?.[0];
      if (!props) throw new Error("Metadata viewer was not rendered");
      expect(props.externalExpansionState).toEqual(
        currentView === "pretty" ? metadataExpansionState : false,
      );
      const nextExpansion = currentView === "pretty" ? { nested: true } : true;
      props.onExternalExpansionChange?.(nextExpansion);
      expect(
        currentView === "pretty"
          ? onMetadataExpansionChange
          : onJsonMetadataExpandedChange,
      ).toHaveBeenCalledWith(nextExpansion);
    },
  );
});
