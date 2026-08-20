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
});
