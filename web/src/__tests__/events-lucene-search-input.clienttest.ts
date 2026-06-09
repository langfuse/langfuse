import {
  applyEventsLuceneTooltipLayout,
  ensureEventsLuceneTooltipFooter,
  handleEventsLuceneAutocompleteKeydown,
  handleEventsLuceneSubmitKeydown,
  handleEventsLuceneTabKeyBinding,
  maybeOpenEventsLuceneContextualCompletion,
  normalizeEventsLuceneEditorValue,
} from "@/src/features/events/components/EventsLuceneSearchInput";

describe("events lucene search enter handling", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("accepts an active completion and immediately submits the completed query", async () => {
    const preventDefault = jest.fn();
    const stopPropagation = jest.fn();
    const onSubmit = jest.fn();

    let currentValue = "environment";

    const handled = handleEventsLuceneSubmitKeydown({
      event: {
        key: "Enter",
        preventDefault,
        stopPropagation,
      },
      completionIsActive: true,
      acceptCompletion: () => {
        currentValue = 'environment:"prod"';
        return true;
      },
      getCurrentValue: () => currentValue,
      onSubmit,
    });

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    jest.runOnlyPendingTimers();
    expect(onSubmit).toHaveBeenCalledWith('environment:"prod"');
  });

  it("submits the accepted completion value instead of the stale pre-accept draft", async () => {
    const preventDefault = jest.fn();
    const stopPropagation = jest.fn();
    const onSubmit = jest.fn();

    let currentValue = "providedModelName:";

    const handled = handleEventsLuceneSubmitKeydown({
      event: {
        key: "Enter",
        preventDefault,
        stopPropagation,
      },
      completionIsActive: true,
      acceptCompletion: () => {
        setTimeout(() => {
          currentValue = 'providedModelName:"gpt-4"';
        }, 0);
        return true;
      },
      getCurrentValue: () => currentValue,
      onSubmit,
    });

    expect(handled).toBe(true);
    jest.runOnlyPendingTimers();
    expect(onSubmit).toHaveBeenCalledWith('providedModelName:"gpt-4"');
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

  it("opens completions for general editing contexts as well", () => {
    const startCompletion = jest.fn();

    const handled = maybeOpenEventsLuceneContextualCompletion({
      doc: 'level:"DEFAULT" AND providedModelName:"gpt-4"',
      cursor: 'level:"DEFAULT" AND providedModelName:"gpt-4"'.length,
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
    expect(
      container.style.getPropertyValue("--events-lucene-tooltip-left"),
    ).toBe("20px");
    expect(
      container.style.getPropertyValue("--events-lucene-tooltip-width"),
    ).toBe("1000px");
  });

  it("adds a docs footer link to the autocomplete dropdown", () => {
    const tooltip = document.createElement("div");

    const footer = ensureEventsLuceneTooltipFooter(tooltip);
    const link = footer.querySelector("a");

    expect(link?.getAttribute("href")).toBe("https://langfuse.com/docs");
    expect(link?.textContent).toBe("Docs ↗");
    expect(
      tooltip.querySelectorAll(".events-lucene-tooltip-footer").length,
    ).toBe(1);

    ensureEventsLuceneTooltipFooter(tooltip);

    expect(
      tooltip.querySelectorAll(".events-lucene-tooltip-footer").length,
    ).toBe(1);
  });

  it("normalizes line breaks out of editor values", () => {
    expect(
      normalizeEventsLuceneEditorValue('level:"ERROR"\nAND name:"foo"'),
    ).toBe('level:"ERROR" AND name:"foo"');
  });

  it("accepts the active completion on tab", () => {
    const preventDefault = jest.fn();
    const stopPropagation = jest.fn();
    const acceptCompletion = jest.fn(() => true);

    const handled = handleEventsLuceneAutocompleteKeydown({
      event: {
        key: "Tab",
        preventDefault,
        stopPropagation,
      },
      completionIsActive: true,
      acceptCompletion,
      closeCompletion: jest.fn(() => true),
      openCompletion: jest.fn(() => true),
    });

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    expect(acceptCompletion).toHaveBeenCalledTimes(1);
  });

  it("swallows tab while completions are open even if acceptance is still pending", () => {
    const acceptCompletion = jest.fn(() => false);

    const handled = handleEventsLuceneTabKeyBinding({
      completionIsActive: true,
      acceptCompletion,
    });

    expect(handled).toBe(true);
    expect(acceptCompletion).toHaveBeenCalledTimes(1);
  });

  it("closes the active completion on escape", () => {
    const preventDefault = jest.fn();
    const stopPropagation = jest.fn();
    const closeCompletion = jest.fn(() => true);

    const handled = handleEventsLuceneAutocompleteKeydown({
      event: {
        key: "Escape",
        preventDefault,
        stopPropagation,
      },
      completionIsActive: true,
      acceptCompletion: jest.fn(() => true),
      closeCompletion,
      openCompletion: jest.fn(() => true),
    });

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    expect(closeCompletion).toHaveBeenCalledTimes(1);
  });

  it("opens completions on arrow-down when the dropdown is closed", () => {
    const preventDefault = jest.fn();
    const stopPropagation = jest.fn();
    const openCompletion = jest.fn(() => true);

    const handled = handleEventsLuceneAutocompleteKeydown({
      event: {
        key: "ArrowDown",
        preventDefault,
        stopPropagation,
      },
      completionIsActive: false,
      acceptCompletion: jest.fn(() => true),
      closeCompletion: jest.fn(() => true),
      openCompletion,
    });

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    expect(openCompletion).toHaveBeenCalledTimes(1);
  });

  it("opens completions on ctrl-space when the dropdown is closed", () => {
    const preventDefault = jest.fn();
    const stopPropagation = jest.fn();
    const openCompletion = jest.fn(() => true);

    const handled = handleEventsLuceneAutocompleteKeydown({
      event: {
        key: " ",
        ctrlKey: true,
        preventDefault,
        stopPropagation,
      },
      completionIsActive: false,
      acceptCompletion: jest.fn(() => true),
      closeCompletion: jest.fn(() => true),
      openCompletion,
    });

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    expect(openCompletion).toHaveBeenCalledTimes(1);
  });
});
