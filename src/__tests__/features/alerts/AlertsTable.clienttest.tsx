import { AlertsTable } from "@/src/features/alerts/AlertsTable";
import { api } from "@/src/utils/api";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

jest.mock("../../../utils/api", () => ({
  api: {
    alerts: {
      all: {
        useQuery: jest.fn(),
      },
    },
  },
}));

describe("AlertsTable", () => {
  it("renders the table headers", () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    (api.alerts.all.useQuery as jest.Mock).mockReturnValue({
      isLoading: false,
      isError: false,
      data: [
        {
          id: "id-1",
          name: "Alert 1",
          triggerAttribute: "cost",
          triggerOperator: ">",
          triggerValue: 10,
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    render(<AlertsTable projectId="7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" />);

    const nameCol = screen.getByText(/Name/);
    expect(nameCol).toBeInTheDocument();
    const triggerCol = screen.getByText(/Trigger/);
    expect(triggerCol).toBeInTheDocument();

    const nameRow = screen.getByText(/Alert 1/);
    expect(nameRow).toBeInTheDocument();
    const triggerRow = screen.getByText(/cost > 10/);
    expect(triggerRow).toBeInTheDocument();
  });
});
