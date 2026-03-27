import { fireEvent, render, screen } from "@testing-library/react";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { resolveEventsLuceneQueryForApi } from "@langfuse/shared";
import { Button } from "@/src/components/ui/button";

jest.mock("../features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => jest.fn(),
}));

describe("DataTableToolbar Lucene search", () => {
  const validateQuery = (query: string) => {
    const resolution = resolveEventsLuceneQueryForApi(query);
    return resolution.isValid ? null : resolution.error;
  };

  it("shows inline validation errors and blocks invalid Lucene submissions", () => {
    const updateQuery = jest.fn();

    render(
      <DataTableToolbar
        columns={[]}
        searchConfig={{
          metadataSearchFields: ["ID"],
          currentQuery: "",
          updateQuery,
          validateQuery,
        }}
      />,
    );

    const input = screen.getByRole("textbox");

    fireEvent.change(input, {
      target: { value: 'name:"chat completion"~2' },
    });

    expect(
      screen.getByText(
        "Invalid Lucene query: Phrase proximity search is not supported in events search.",
      ),
    ).toBeTruthy();

    fireEvent.keyDown(input, {
      key: "Enter",
      code: "Enter",
    });

    expect(updateQuery).not.toHaveBeenCalled();
  });

  it("submits valid Lucene queries and rehydrates restored query state", () => {
    const updateQuery = jest.fn();

    const { rerender } = render(
      <DataTableToolbar
        columns={[]}
        searchConfig={{
          metadataSearchFields: ["ID"],
          currentQuery: "traceId:trace-123",
          updateQuery,
          validateQuery,
        }}
      />,
    );

    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("traceId:trace-123");

    fireEvent.change(input, {
      target: { value: "name:weather-agent AND NOT level:DEBUG" },
    });
    fireEvent.keyDown(input, {
      key: "Enter",
      code: "Enter",
    });

    expect(updateQuery).toHaveBeenCalledWith(
      "name:weather-agent AND NOT level:DEBUG",
    );

    rerender(
      <DataTableToolbar
        columns={[]}
        searchConfig={{
          metadataSearchFields: ["ID"],
          currentQuery: "metadata.environment:prod",
          updateQuery,
          validateQuery,
        }}
      />,
    );

    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
      "metadata.environment:prod",
    );
  });

  it("accepts nested and chained boolean lucene queries", () => {
    const updateQuery = jest.fn();

    render(
      <DataTableToolbar
        columns={[]}
        searchConfig={{
          metadataSearchFields: ["ID"],
          currentQuery: "",
          updateQuery,
          validateQuery,
        }}
      />,
    );

    const input = screen.getByRole("textbox");

    fireEvent.change(input, {
      target: {
        value:
          "name:weather AND (level:ERROR OR (environment:prod AND NOT sessionId:abc))",
      },
    });
    fireEvent.keyDown(input, {
      key: "Enter",
      code: "Enter",
    });

    expect(updateQuery).toHaveBeenCalledWith(
      "name:weather AND (level:ERROR OR (environment:prod AND NOT sessionId:abc))",
    );
  });

  it("shows a validation error for unfielded lucene operators", () => {
    const updateQuery = jest.fn();

    render(
      <DataTableToolbar
        columns={[]}
        searchConfig={{
          metadataSearchFields: ["ID"],
          currentQuery: "",
          updateQuery,
          validateQuery,
        }}
      />,
    );

    const input = screen.getByRole("textbox");

    fireEvent.change(input, {
      target: { value: "foo OR bar" },
    });

    expect(
      screen.getByText(
        "Invalid Lucene query: Lucene operators require explicit field names in the events search bar. Use plain free text for broad search, or fielded clauses like name:weather AND level:ERROR.",
      ),
    ).toBeTruthy();
  });

  it("allows custom search inputs to submit the latest live value", () => {
    const updateQuery = jest.fn();

    render(
      <DataTableToolbar
        columns={[]}
        searchConfig={{
          currentQuery: "",
          updateQuery,
          renderInput: ({ onChange, onSubmit }) => (
            <Button
              type="button"
              onClick={() => {
                onChange("traceId:live-value");
                onSubmit("traceId:live-value");
              }}
            >
              Submit live value
            </Button>
          ),
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Submit live value" }));

    expect(updateQuery).toHaveBeenCalledWith("traceId:live-value");
  });
});
