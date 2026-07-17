import { fireEvent, render, screen } from "@testing-library/react";
import { IOTableCell } from "@/src/components/ui/IOTableCell";
import { MarkdownContextProvider } from "@/src/features/theming/useMarkdownContext";

vi.mock("next/router", () => ({
  useRouter: () => ({ query: {} }),
}));

vi.mock("posthog-js/react", () => ({
  usePostHog: () => ({ capture: vi.fn() }),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    media: {
      getById: {
        useQuery: () => ({ isError: false, data: undefined }),
      },
    },
  },
}));

const MEDIA_REF =
  "@@@langfuseMedia:type=image/png|id=cc48838a-3da8-4ca4-a007-2cf8df930e69|source=bytes@@@";

const renderCell = (props: {
  data: unknown;
  singleLine: boolean;
  enableExpandOnHover?: boolean;
}) =>
  render(
    <MarkdownContextProvider>
      <IOTableCell {...props} />
    </MarkdownContextProvider>,
  );

/**
 * Native title tooltips render on top of open popovers (media peek, cell
 * expand card), so the single-line cell title must yield whenever such a
 * hover surface supersedes it.
 */
describe("IOTableCell native title suppression", () => {
  it("single-line: drops the cell title while the pointer is over a media chip", () => {
    const { container } = renderCell({
      data: `Here is an image: ${MEDIA_REF} — nice.`,
      singleLine: true,
    });

    const cell = container.querySelector("[title]")!;
    expect(cell.getAttribute("title")).toContain("Here is an image");

    fireEvent.pointerOver(screen.getByRole("button", { name: "PNG media" }));
    expect(cell.getAttribute("title")).toBeNull();

    // moving off the chip back onto cell text restores the title
    fireEvent.pointerOver(cell);
    expect(cell.getAttribute("title")).toContain("Here is an image");
  });

  it("single-line: has no cell title when the expand-on-hover card previews the content", () => {
    const { container } = renderCell({
      data: "Langfuse is an open-source LLM engineering platform.",
      singleLine: true,
      enableExpandOnHover: true,
    });

    expect(container.querySelector("[title]")).toBeNull();
  });

  it("single-line: keeps the cell title otherwise", () => {
    const text = "Langfuse is an open-source LLM engineering platform.";
    const { container } = renderCell({ data: text, singleLine: true });

    expect(container.querySelector("[title]")?.getAttribute("title")).toBe(
      text,
    );
  });
});

/**
 * Chip quote consistency across row heights: JSON.stringify wraps media
 * reference strings in quotes — as a lone compact-verbosity value
 * ('"@@@ref@@@"') and nested inside stringified JSON — so single-line rows
 * used to render quoted chips while the multi-line JSON view rendered bare
 * chips. A quote pair directly enclosing a chip is now dropped, so chips
 * render unquoted at every height; text keeps its existing rendering.
 */
describe("IOTableCell media chip rendering", () => {
  it("single-line: lone JSON-encoded media ref renders as a bare chip", () => {
    const { container } = renderCell({
      data: JSON.stringify(MEDIA_REF),
      singleLine: true,
    });

    expect(
      screen.getByRole("button", { name: "PNG media" }),
    ).toBeInTheDocument();
    expect(container.textContent).not.toContain('"');
  });

  it("multi-line: lone JSON-encoded media ref renders as a bare chip", () => {
    const { container } = renderCell({
      data: JSON.stringify(MEDIA_REF),
      singleLine: false,
    });

    expect(
      screen.getByRole("button", { name: "PNG media" }),
    ).toBeInTheDocument();
    expect(container.textContent).not.toContain('"');
  });

  it("multi-line: bare media ref string renders as an unquoted chip", () => {
    const { container } = renderCell({ data: MEDIA_REF, singleLine: false });

    expect(
      screen.getByRole("button", { name: "PNG media" }),
    ).toBeInTheDocument();
    expect(container.textContent).not.toContain('"');
  });

  it("single-line: media chip nested in JSON drops its enclosing quote pair", () => {
    const { container } = renderCell({
      data: { image: MEDIA_REF },
      singleLine: true,
    });

    expect(
      screen.getByRole("button", { name: "PNG media" }),
    ).toBeInTheDocument();
    expect(container.textContent).toContain('"image": PNG');
    expect(container.textContent).not.toContain('"PNG"');
  });

  it("single-line: adjacent media refs in an array each drop their quote pair", () => {
    const { container } = renderCell({
      data: [MEDIA_REF, MEDIA_REF],
      singleLine: true,
    });

    expect(screen.getAllByRole("button", { name: "PNG media" })).toHaveLength(
      2,
    );
    expect(container.textContent).not.toContain('"');
  });

  it("single-line: media ref embedded in longer text renders as chip within the text", () => {
    const { container } = renderCell({
      data: `Here is an image: ${MEDIA_REF} — nice.`,
      singleLine: true,
    });

    expect(
      screen.getByRole("button", { name: "PNG media" }),
    ).toBeInTheDocument();
    expect(container.textContent).toContain("Here is an image: PNG — nice.");
  });

  it("single-line: top-level plain text renders unquoted", () => {
    const text = "Langfuse is an open-source AI engineering platform";
    const { container } = renderCell({ data: text, singleLine: true });

    expect(container.textContent).toContain(text);
    expect(container.textContent).not.toContain('"');
  });

  it("multi-line: object data still renders as a JSON tree", () => {
    const { container } = renderCell({
      data: { foo: "bar" },
      singleLine: false,
    });

    expect(container.textContent).toContain("foo");
    expect(container.textContent).toContain("bar");
  });

  it("multi-line: stringified JSON still deep-parses into a JSON tree", () => {
    const { container } = renderCell({
      data: '{"foo":"bar"}',
      singleLine: false,
    });

    expect(container.textContent).toContain("foo");
    expect(container.textContent).toContain("bar");
  });

  it("multi-line: long content is truncated", () => {
    const { container } = renderCell({
      data: "x".repeat(10_050),
      singleLine: false,
    });

    expect(container.textContent).toContain("truncated");
  });
});
