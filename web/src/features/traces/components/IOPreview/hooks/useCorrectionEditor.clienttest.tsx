import { act, renderHook } from "@testing-library/react";
import { useCorrectionEditor } from "./useCorrectionEditor";

describe("useCorrectionEditor", () => {
  const actualOutput = { answer: "original" };

  it("prefills from the actual output on edit without saving", () => {
    const onSave = vi.fn();
    const setSaveStatus = vi.fn();
    const { result } = renderHook(() =>
      useCorrectionEditor({
        correctionValue: "",
        actualOutput,
        onSave,
        setSaveStatus,
      }),
    );

    act(() => result.current.handleEdit());

    expect(result.current.isEditing).toBe(true);
    expect(result.current.value).toBe(JSON.stringify(actualOutput));
    expect(onSave).not.toHaveBeenCalled();
    expect(setSaveStatus).not.toHaveBeenCalled();
  });

  it("mounts in edit mode prefilled, saving only once the user types", () => {
    vi.useFakeTimers();
    const onSave = vi.fn();
    const { result } = renderHook(() =>
      useCorrectionEditor({
        correctionValue: "",
        actualOutput,
        onSave,
        setSaveStatus: vi.fn(),
        initialEditing: true,
      }),
    );

    expect(result.current.isEditing).toBe(true);
    expect(result.current.value).toBe(JSON.stringify(actualOutput));
    expect(onSave).not.toHaveBeenCalled();

    act(() => result.current.handleChange('{"answer":"fixed"}'));
    act(() => {
      vi.runAllTimers();
    });

    expect(onSave).toHaveBeenCalledWith('{"answer":"fixed"}');
    vi.useRealTimers();
  });
});
