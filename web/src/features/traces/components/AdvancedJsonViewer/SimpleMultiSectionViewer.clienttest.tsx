/**
 * Jump-to in the non-virtualized JSON viewer must snap to the section, not
 * animate. Smooth scrolling makes Input/Output/Metadata hops feel slow.
 *
 * Row/header internals are stubbed so this file does not pull the media
 * viewer (and `@langfuse/shared`) just to assert scroll behavior.
 */
import { createRef, type RefObject } from "react";
import { render } from "@testing-library/react";

vi.mock("./components/JsonRowFixed", () => ({
  JsonRowFixed: () => <div />,
}));
vi.mock("./components/JsonRowScrollable", () => ({
  JsonRowScrollable: () => <div />,
}));
vi.mock("./components/MultiSectionJsonViewerHeader", () => ({
  MultiSectionJsonViewerHeader: ({ title }: { title: string }) => (
    <div>{title}</div>
  ),
}));

import {
  SimpleMultiSectionViewer,
  type SimpleMultiSectionViewerHandle,
} from "./SimpleMultiSectionViewer";
import { buildMultiSectionTree } from "./utils/multiSectionTree";
import type { JSONTheme, JsonSection } from "./types";

const theme: JSONTheme = {
  background: "#fff",
  foreground: "#000",
  keyColor: "#000",
  stringColor: "#000",
  numberColor: "#000",
  booleanColor: "#000",
  nullColor: "#000",
  punctuationColor: "#000",
  lineNumberColor: "#000",
  expandButtonColor: "#000",
  copyButtonColor: "#000",
  hoverBackground: "#eee",
  selectedBackground: "#eee",
  searchMatchBackground: "#ff0",
  searchCurrentBackground: "#ff0",
  fontSize: "12px",
  lineHeight: 20,
  indentSize: 12,
};

describe("SimpleMultiSectionViewer jump-to", () => {
  it("scrolls to a section instantly", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    const tree = buildMultiSectionTree(
      [
        { key: "input", data: { hello: "world" } },
        { key: "output", data: { result: 1 } },
      ],
      { initialExpansion: true },
    );
    const sections: JsonSection[] = [
      { key: "input", data: { hello: "world" }, title: "Input" },
      { key: "output", data: { result: 1 }, title: "Output" },
    ];

    const viewerRef = createRef<SimpleMultiSectionViewerHandle>();
    const scrollContainerRef = createRef<HTMLDivElement>();

    render(
      <div ref={scrollContainerRef}>
        <SimpleMultiSectionViewer
          ref={viewerRef}
          tree={tree}
          sections={sections}
          expansionVersion={0}
          theme={theme}
          scrollContainerRef={scrollContainerRef as RefObject<HTMLDivElement>}
        />
      </div>,
    );

    viewerRef.current?.scrollToSection("output");

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({
        behavior: "instant",
        block: "start",
      }),
    );
  });
});
