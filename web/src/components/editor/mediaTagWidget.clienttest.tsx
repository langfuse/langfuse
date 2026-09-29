// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import ReactCodeMirror from "@uiw/react-codemirror";
import { useMediaTagChips } from "@/src/components/editor/mediaTagWidget";

vi.mock("@/src/components/ui/media/MediaReferenceTag", () => ({
  MediaReferenceTag: () => <button data-testid="media-tag">DOCX</button>,
}));

const MEDIA_REFERENCE =
  "@@@langfuseMedia:type=application/vnd.openxmlformats-officedocument.wordprocessingml.document|id=document|source=bytes@@@";

function MediaTagEditor() {
  const { extension, portals } = useMediaTagChips();

  return (
    <>
      <ReactCodeMirror
        value={`{"media":"${MEDIA_REFERENCE}"}`}
        extensions={[extension]}
      />
      {portals}
    </>
  );
}

describe("media tag editor widget", () => {
  it("uses the surrounding text baseline", async () => {
    render(<MediaTagEditor />);

    const anchor = (await screen.findByTestId("media-tag")).parentElement;

    expect(anchor?.style.verticalAlign).toBe("");
  });
});
