import { fireEvent, render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";

import {
  Form,
  FormField,
  FormItem,
  FormMessage,
  hasArrayLevelFieldError,
} from "@/src/components/ui/form";

type Values = {
  categories: Array<{ value: string }>;
};

function FormMessageProbe() {
  const form = useForm<Values>({
    defaultValues: { categories: [{ value: "" }, { value: "" }] },
  });

  // RHF FieldPath omits Zod nested keys like `.root` / `.config`.
  const setNestedError = (name: string, message: string) => {
    form.setError(name as never, { message });
  };

  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="categories"
        render={() => (
          <FormItem>
            <FormMessage />
          </FormItem>
        )}
      />
      <button
        type="button"
        onClick={() => {
          form.setError("categories.0.value", {
            message: "Category cannot be empty",
          });
        }}
      >
        item-only
      </button>
      <button
        type="button"
        onClick={() => {
          form.setError("categories", {
            message: "Categories must be unique",
          });
        }}
      >
        array-only
      </button>
      <button
        type="button"
        onClick={() => {
          form.setError("categories.0.value", {
            message: "Category cannot be empty",
          });
          setNestedError("categories.root", "Add at least two categories");
        }}
      >
        item-and-root
      </button>
      <button
        type="button"
        onClick={() => {
          setNestedError("categories.config", "Expected string");
        }}
      >
        union
      </button>
      <button
        type="button"
        onClick={() => {
          form.setError("categories", { message: "" });
        }}
      >
        empty-message
      </button>
    </Form>
  );
}

describe("FormMessage", () => {
  it("renders an item-only nested message on the parent field", () => {
    render(<FormMessageProbe />);

    fireEvent.click(screen.getByRole("button", { name: "item-only" }));

    expect(screen.getByText("Category cannot be empty")).toBeInTheDocument();
  });

  it("renders an array-level message", () => {
    render(<FormMessageProbe />);

    fireEvent.click(screen.getByRole("button", { name: "array-only" }));

    expect(screen.getByText("Categories must be unique")).toBeInTheDocument();
  });

  it("renders the array-level root message when item errors also exist", () => {
    render(<FormMessageProbe />);

    fireEvent.click(screen.getByRole("button", { name: "item-and-root" }));

    expect(screen.getByText("Add at least two categories")).toBeInTheDocument();
  });

  it("renders a nested union-path message", () => {
    render(<FormMessageProbe />);

    fireEvent.click(screen.getByRole("button", { name: "union" }));

    expect(screen.getByText("Expected string")).toBeInTheDocument();
  });

  it("renders nothing for an empty message object", () => {
    render(<FormMessageProbe />);

    fireEvent.click(screen.getByRole("button", { name: "empty-message" }));

    expect(screen.queryByRole("paragraph")).not.toBeInTheDocument();
  });
});

describe("hasArrayLevelFieldError", () => {
  it("is false for item-only nested errors", () => {
    expect(
      hasArrayLevelFieldError({
        0: { value: { message: "Enter a category value" } },
      }),
    ).toBe(false);
  });

  it("is true for a string message on the field", () => {
    expect(hasArrayLevelFieldError({ message: "Add at least two" })).toBe(true);
  });

  it("is true for root.message even when item errors also exist", () => {
    expect(
      hasArrayLevelFieldError({
        root: { message: "Add at least two" },
        0: { value: { message: "Enter a category value" } },
      }),
    ).toBe(true);
  });

  it("is false for an empty message object", () => {
    expect(hasArrayLevelFieldError({ message: "" })).toBe(false);
  });
});
