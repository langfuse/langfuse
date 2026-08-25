import { render, screen } from "@testing-library/react";

import { CostBadge, UsageBadge } from "./ObservationMetadataBadgesTooltip";

describe("UsageBadge", () => {
  it("hides the usage info icon for tool observations with no usage", () => {
    const { container } = render(
      <UsageBadge
        type="TOOL"
        inputUsage={0}
        outputUsage={0}
        totalUsage={0}
        usageDetails={{ input: 0, output: 0, total: 0 }}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("hides the usage info icon when aggregated usage details are all zero", () => {
    const { container } = render(
      <UsageBadge
        type="GENERATION"
        inputUsage={0}
        outputUsage={0}
        totalUsage={0}
        usageDetails={{ input: 0, output: 0, total: 0 }}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows usage for generation-like observations with tokens", () => {
    render(
      <UsageBadge
        type="GENERATION"
        inputUsage={12}
        outputUsage={3}
        totalUsage={15}
        usageDetails={{ input: 12, output: 3, total: 15 }}
      />,
    );

    expect(
      screen.getByText("12 prompt → 3 completion (∑ 15)"),
    ).toBeInTheDocument();
  });

  it("shows usage for tool observations that have ingested tokens", () => {
    render(
      <UsageBadge
        type="TOOL"
        inputUsage={4}
        outputUsage={0}
        totalUsage={4}
        usageDetails={{ input: 4, total: 4 }}
      />,
    );

    expect(
      screen.getByText("4 prompt → 0 completion (∑ 4)"),
    ).toBeInTheDocument();
  });

  it("shows usage when only custom usage details are present", () => {
    render(
      <UsageBadge
        type="EMBEDDING"
        inputUsage={0}
        outputUsage={0}
        totalUsage={0}
        usageDetails={{ cache_read: 50 }}
      />,
    );

    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("shows token counts without a usage info icon when the breakdown is empty", () => {
    render(
      <UsageBadge
        type="AGENT"
        inputUsage={12}
        outputUsage={3}
        totalUsage={15}
        usageDetails={{ input: 0, output: 0, total: 0 }}
      />,
    );

    expect(
      screen.getByText("12 prompt → 3 completion (∑ 15)"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("CostBadge", () => {
  it("hides when cost is zero", () => {
    const { container } = render(
      <CostBadge
        totalCost={0}
        costDetails={{ input: 0, output: 0, total: 0 }}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
