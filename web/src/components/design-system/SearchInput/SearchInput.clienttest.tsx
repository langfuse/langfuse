import { fireEvent, render, screen } from "@testing-library/react";
import { SearchInput } from "./SearchInput";

const noop = () => {};

describe("SearchInput", () => {
  it("suppresses onChange while an IME composition is in progress and commits once at compositionEnd", () => {
    const onChange = vi.fn();
    render(
      <SearchInput
        value=""
        onChange={onChange}
        onSubmit={noop}
        placeholder="Search..."
      />,
    );

    const input = screen.getByPlaceholderText("Search...");

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "内" } });
    fireEvent.change(input, { target: { value: "内部" } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.compositionEnd(input, { target: { value: "内部" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("内部");
  });

  it("still calls onChange immediately for plain (non-IME) typing", () => {
    const onChange = vi.fn();
    render(
      <SearchInput
        value=""
        onChange={onChange}
        onSubmit={noop}
        placeholder="Search..."
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Search..."), {
      target: { value: "abc" },
    });

    expect(onChange).toHaveBeenCalledWith("abc");
  });
});
