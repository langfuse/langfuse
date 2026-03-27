import { handleEventsLuceneSubmitKeydown } from "@/src/features/events/components/EventsLuceneSearchInput";

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
});
