const translation = {
  trace: {
    pages: {
      title: "Tracing",
      description: "A trace represents a single function/api invocation. Traces contain observations. See docs to learn more.",
    },
    actions: {
      deleted: "Trace deleted",
      deletedDescription: "Selected trace will be deleted. Traces are removed asynchronously and may continue to be visible for up to 15 minutes.",
      search: "Search",
      collapseAll: "Collapse all",
      expandAll: "Expand all",
      downloadAsJson: "Download trace as JSON",
    },
    errors: {
      notFound: "Trace not found",
      notFoundDescription: "The trace is either still being processed or has been deleted.",
      sdkUpgradeRequired: "Please upgrade the SDK as the URL schema has changed.",
      noAccess: "You do not have access to this trace.",
    },
    ids: {
      traceId: "Trace ID",
      observationId: "Observation ID",
      copyId: "Copy ID",
    },
    io: {
      input: "Input",
      output: "Output",
      statusMessage: "Status Message",
      additionalInput: "Additional Input",
      placeholder: "Placeholder",
      unnamedPlaceholder: "Unnamed placeholder",
      hideHistory: "Hide history",
    },
    breakdown: {
      costBreakdown: "Cost breakdown",
      usageBreakdown: "Usage breakdown",
      inputCost: "Input cost",
      outputCost: "Output cost",
      inputUsage: "Input usage",
      outputUsage: "Output usage",
      totalCost: "Total cost",
      totalUsage: "Total usage",
      otherCost: "Other cost",
      otherUsage: "Other usage",
    },
    observation: {
      viewModelDetails: "View model details",
      aggregatedDuration: "Aggregated duration of all child observations",
      aggregatedCost: "Aggregated cost of all child observations",
    },
    common: {
      metadata: "Metadata",
      viewOptions: "View Options",
      traces: "Traces",
    },
  },
  observation: {
    pages: {
      title: "Tracing",
      description: "An observation captures a single function call in an application. See docs to learn more.",
    },
  },
  session: {
    pages: {
      title: "Sessions",
      description: "A session is a collection of related traces, such as a conversation or thread. To begin, add a sessionId to the trace.",
    },
  },
};

export default translation;
