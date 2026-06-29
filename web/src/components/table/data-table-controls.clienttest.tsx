import { render, screen } from "@testing-library/react";
import { Accordion } from "@/src/components/ui/accordion";
import { CategoricalFacet } from "./data-table-controls";

describe("CategoricalFacet", () => {
  it("shows selected values even when the backend returns no options", () => {
    render(
      <Accordion type="multiple" value={["type"]}>
        <CategoricalFacet
          label="Type"
          filterKey="type"
          expanded
          loading={false}
          options={[]}
          counts={new Map()}
          value={["AGENT"]}
          onChange={() => {}}
          isActive
          isDisabled={false}
          onReset={() => {}}
        />
      </Accordion>,
    );

    expect(screen.getByText("AGENT")).toBeInTheDocument();
    expect(screen.queryByText("No options found")).not.toBeInTheDocument();
  });

  it("shows Clear for active selected values even when the backend returns no options", () => {
    render(
      <Accordion type="multiple" value={["type"]}>
        <CategoricalFacet
          label="Type"
          filterKey="type"
          expanded
          loading={false}
          options={[]}
          counts={new Map()}
          value={["AGENT"]}
          onChange={() => {}}
          isActive
          isDisabled={false}
          onReset={() => {}}
        />
      </Accordion>,
    );

    expect(screen.getByLabelText("Clear Type filter")).toBeInTheDocument();
  });
});
