import {
  applyEventsLuceneTooltipLayout,
  handleEventsLuceneSubmitKeydown,
  maybeOpenEventsLuceneContextualCompletion,
} from "@/src/features/events/components/EventsLuceneSearchInput";

describe("events lucene search enter handling", () => {
  it("submits the accepted completion value when enter is pressed with an active suggestion", () => {
    const preventDefault = jest.fn();
    const stopPropagation = jest.fn();
    const onSubmit = jest.fn();

    let currentValue = "level:ER";

    const handled = handleEventsLuceneSubmitKeydown({
      event: {
        key: "Enter",
        preventDefault,
        stopPropagation,
      },
      completionIsActive: true,
      acceptCompletion: () => {
        currentValue = "level:ERROR";
        return true;
      },
      getCurrentValue: () => currentValue,
      onSubmit,
    });

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith("level:ERROR");
  });

  it("prevents shift-enter from inserting a newline by submitting instead", () => {
    const preventDefault = jest.fn();
    const stopPropagation = jest.fn();
    const onSubmit = jest.fn();

    const handled = handleEventsLuceneSubmitKeydown({
      event: {
        key: "Enter",
        preventDefault,
        stopPropagation,
      },
      completionIsActive: false,
      acceptCompletion: () => false,
      getCurrentValue: () => 'name:"weather agent"',
      onSubmit,
    });

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith('name:"weather agent"');
  });

  it("opens completions immediately for an empty search bar", () => {
    const startCompletion = jest.fn();

    const handled = maybeOpenEventsLuceneContextualCompletion({
      doc: "",
      cursor: 0,
      completionStatus: null,
      startCompletion,
    });

    expect(handled).toBe(true);
    expect(startCompletion).toHaveBeenCalledTimes(1);
  });

  it("opens value completions immediately after a field colon", () => {
    const startCompletion = jest.fn();

    const handled = maybeOpenEventsLuceneContextualCompletion({
      doc: "traceName:",
      cursor: "traceName:".length,
      completionStatus: null,
      startCompletion,
    });

    expect(handled).toBe(true);
    expect(startCompletion).toHaveBeenCalledTimes(1);
  });

  it("does not reopen completions when suggestions are already active", () => {
    const startCompletion = jest.fn();

    const handled = maybeOpenEventsLuceneContextualCompletion({
      doc: "traceName:",
      cursor: "traceName:".length,
      completionStatus: "active",
      startCompletion,
    });

    expect(handled).toBe(false);
    expect(startCompletion).not.toHaveBeenCalled();
  });

  it("stretches the autocomplete dropdown to the full search bar width", () => {
    const container = document.createElement("div");
    const offsetParent = document.createElement("div");
    const tooltip = document.createElement("div");

    Object.defineProperty(tooltip, "offsetParent", {
      configurable: true,
      value: offsetParent,
    });

    container.getBoundingClientRect = () =>
      ({
        left: 32,
        top: 12,
        right: 1032,
        bottom: 60,
        width: 1000,
        height: 48,
        x: 32,
        y: 12,
        toJSON: () => ({}),
      }) as DOMRect;
    offsetParent.getBoundingClientRect = () =>
      ({
        left: 12,
        top: 0,
        right: 1212,
        bottom: 600,
        width: 1200,
        height: 600,
        x: 12,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const applied = applyEventsLuceneTooltipLayout({
      container,
      tooltip,
    });

    expect(applied).toBe(true);
    expect(tooltip.style.left).toBe("20px");
    expect(tooltip.style.width).toBe("1000px");
    expect(tooltip.style.minWidth).toBe("1000px");
    expect(tooltip.style.maxWidth).toBe("1000px");
    expect(tooltip.style.right).toBe("auto");
  });
});
