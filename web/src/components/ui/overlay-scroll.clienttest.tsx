/**
 * A Dialog/Sheet/Drawer locks page scrolling with `react-remove-scroll`, whose
 * document-level listener cancels wheel and touch-move events that reach it from
 * outside the locked subtree. Popover and hover-card content portals into an
 * overlay layer, i.e. always outside it, so these events must stay inside the
 * overlay — otherwise a scrollable list in a picker opened from a dialog freezes
 * for wheel and touch while keyboard navigation still works.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";

describe("overlay content keeps scroll events local", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  const atDocument: string[] = [];
  const record = (event: Event) => atDocument.push(event.type);

  beforeEach(() => {
    atDocument.length = 0;
    document.addEventListener("wheel", record);
    document.addEventListener("touchmove", record);
  });

  afterEach(() => {
    document.removeEventListener("wheel", record);
    document.removeEventListener("touchmove", record);
  });

  const scroll = (element: HTMLElement) => {
    fireEvent.wheel(element);
    fireEvent.touchMove(element);
  };

  it("popover: neither event reaches the document", () => {
    render(
      <Popover open>
        <PopoverTrigger>open</PopoverTrigger>
        <PopoverContent>
          <button>option</button>
        </PopoverContent>
      </Popover>,
    );

    scroll(screen.getByRole("button", { name: "option" }));

    expect(atDocument).toEqual([]);
  });

  it("hover card: neither event reaches the document", () => {
    render(
      <HoverCard open>
        <HoverCardTrigger>hover</HoverCardTrigger>
        <HoverCardContent>
          <pre>preview</pre>
        </HoverCardContent>
      </HoverCard>,
    );

    scroll(screen.getByText("preview"));

    expect(atDocument).toEqual([]);
  });

  it("page content is untouched: both events reach the document", () => {
    render(<button>in the page</button>);

    scroll(screen.getByRole("button", { name: "in the page" }));

    expect(atDocument).toEqual(["wheel", "touchmove"]);
  });
});
