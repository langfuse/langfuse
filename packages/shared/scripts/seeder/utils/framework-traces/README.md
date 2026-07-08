# Framework Traces

This folder contains real traces produced through framework instrumentation.
Most of them stem from here: https://langfuse.com/integrations/frameworks/agno-agents and so on.

## How to add further traces
1. Generate a trace
2. Download the trace from the UI using the download button. This **excludes** the `input`/`output`/`metadata` fields of the observations
3. In the trace, click `Log View (Beta)` and switch to `JSON` format. Click the copy all button and save this to a file in this folder.
4. Run the script `npx ts-node merge-observations.ts trace-file.json observations.json trace-merged.json`
5. Leave the `merged` file in this folder. Name it with the date of the trace as displayed in the UI.
6. ???
7. Profit

## How to use the trace in the UI

All trace ids are like `framework-frameworkName-traceId`, so search for framework in the trace table.
We don't rewrite the time, so you have to filter for All Time most likely.
Also, you can filter for `source: "framework-trace"` on the trace to find them.
