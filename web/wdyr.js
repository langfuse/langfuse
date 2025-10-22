import React from "react";

if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  const whyDidYouRender = require("@welldone-software/why-did-you-render");
  whyDidYouRender(React, {
    trackAllPureComponents: false, // Set to false to avoid conflicts
    trackHooks: true,
    logGroupCollapsed: true,
    include: [
      /TraceTree/,
      /TreeNode/,
      /SpanItem/,
      /IOPreview/,
      /IOTableCell/,
      /OpenAiMessageView/,
    ],
    logOnDifferentValues: true,
    hotReloadBufferMs: 500,
    // onlyLogs: true, // Only use console logs, avoid other integrations
    collapseGroups: true,
  });
}
