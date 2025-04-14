type UseViewDataProps = {
  tableName: string;
};

const mockSavedViews = [
  {
    id: "1",
    name: "High Latency Traces",
    tableName: "traces",
    createdAt: new Date("2023-04-15"),
  },
  {
    id: "2",
    name: "Error Traces",
    tableName: "traces",
    createdAt: new Date("2023-05-20"),
  },
  {
    id: "3",
    name: "Production Environment Only",
    tableName: "traces",
    createdAt: new Date("2023-06-10"),
  },
  {
    id: "4",
    name: "Last 24 Hours Activity",
    tableName: "traces",
    createdAt: new Date("2023-07-05"),
  },
  {
    id: "5",
    name: "Expensive Completions",
    tableName: "traces",
    createdAt: new Date("2023-08-12"),
  },
];

export const useViewData = ({ tableName }: UseViewDataProps) => {
  return {
    savedViewList: mockSavedViews,
  };
};
