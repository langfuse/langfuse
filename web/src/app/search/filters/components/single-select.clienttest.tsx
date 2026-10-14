/**
 * An empty key or value passes `singleFilter.safeParse`, so anything
 * `SingleSelect` commits reaches the applied filter state. Committing `""` would
 * apply a filter that matches nothing.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { SingleSelect } from "./single-select";

describe("SingleSelect", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Element.prototype.scrollIntoView = vi.fn();
  });

  const open = () => fireEvent.click(screen.getByRole("button"));

  it("re-clicking the selected option: no commit", () => {
    const onValueChange = vi.fn();
    render(
      <SingleSelect
        title="Key"
        value="environment"
        options={[{ value: "environment" }, { value: "release" }]}
        onValueChange={onValueChange}
      />,
    );

    open();
    fireEvent.click(screen.getByRole("option", { name: "environment" }));

    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("clicking another option: commits that value", () => {
    const onValueChange = vi.fn();
    render(
      <SingleSelect
        title="Key"
        value="environment"
        options={[{ value: "environment" }, { value: "release" }]}
        onValueChange={onValueChange}
      />,
    );

    open();
    fireEvent.click(screen.getByRole("option", { name: "release" }));

    expect(onValueChange).toHaveBeenCalledWith("release");
  });

  it("renders display labels but commits stable option values", () => {
    const onValueChange = vi.fn();
    render(
      <SingleSelect
        title="Evaluator"
        options={[
          { value: "evaluator-1", displayValue: "Answer quality" },
          { value: "evaluator-2", displayValue: "Hallucination" },
        ]}
        onValueChange={onValueChange}
      />,
    );

    open();
    fireEvent.click(screen.getByRole("option", { name: "Answer quality" }));

    expect(onValueChange).toHaveBeenCalledWith("evaluator-1");
  });

  it("finds duplicate display labels by their visible stable value", () => {
    render(
      <SingleSelect
        title="Evaluator"
        options={[
          { value: "evaluator-1", displayValue: "Answer quality" },
          { value: "evaluator-2", displayValue: "Answer quality" },
        ]}
        onValueChange={() => {}}
        showOptionValue
      />,
    );

    open();
    fireEvent.change(screen.getByPlaceholderText("Evaluator"), {
      target: { value: "evaluator-2" },
    });

    expect(screen.getByText("(evaluator-2)")).toBeInTheDocument();
  });

  it("shows stable option values only for duplicate display labels", () => {
    render(
      <SingleSelect
        title="Evaluator"
        value="evaluator-1"
        options={[
          { value: "evaluator-1", displayValue: "Answer quality" },
          { value: "evaluator-2", displayValue: "Answer quality" },
          { value: "evaluator-3", displayValue: "Hallucination" },
        ]}
        onValueChange={() => {}}
        showOptionValue
      />,
    );

    expect(screen.getByText("Answer quality")).toHaveClass("shrink-0");
    expect(screen.getByText("(evaluator-1)")).toHaveClass(
      "text-muted-foreground",
      "font-normal",
      "truncate",
    );

    open();
    expect(screen.getAllByText("(evaluator-1)")).toHaveLength(2);
    expect(screen.getByText("(evaluator-2)")).toBeInTheDocument();
    expect(screen.queryByText("(evaluator-3)")).not.toBeInTheDocument();
    expect(screen.getByText("Hallucination")).toHaveAttribute(
      "title",
      "Hallucination (evaluator-3)",
    );
    expect(screen.getByText("Hallucination").parentElement).toHaveClass(
      "flex-1",
    );
  });
});
