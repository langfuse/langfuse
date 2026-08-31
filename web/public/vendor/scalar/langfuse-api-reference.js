Scalar.createApiReference("#app", {
  url: "../generated/api/openapi.yml",
  agent: { disabled: true },
  mcp: { disabled: true },
  telemetry: false,
  withDefaultFonts: false,
  customCss: `
    :root {
      --scalar-font: ui-sans-serif, system-ui, sans-serif;
      --scalar-font-code: ui-monospace, monospace;
    }
  `,
});
