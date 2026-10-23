# TraceSetup

The first-trace page of a new project: pick a way in, set it up while the card listens, read the first trace, then follow the next step to a set-up project.

## Who owns what

| Path                                | Owns                                                                                                                                                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TraceSetupView.tsx`                | The page: header, stepper, the get-started row and the jobs. Takes `model`, `project` and `actions`, nothing else.                                                                                                           |
| `useTraceSetup.ts`                  | The state machine (`traceSetupReducer`) and the hook the page runs it with. Server calls go through `effects`; what the page learns (a trace arrived, time passed, they came back from the trace) goes in through `receive`. |
| `useIntegrationsPanel.ts`           | Opening and closing the integrations panel, and giving focus back to the control that opened it.                                                                                                                             |
| `types.ts`                          | The model: `TraceSetupState` per step, `ProjectKeys`, `NewProject`, `PanelView`, `SetupProject`, `TraceSetupActions`.                                                                                                        |
| `firstTrace.ts`                     | Reading a trace once (`readingOf`): its receipt, failed step, tip and Halo asks.                                                                                                                                             |
| `gates.ts`                          | Which gates are open, passed or next, from the reading, the scoring and the team.                                                                                                                                            |
| `codingAgents.ts`, `agentPrompt.ts` | The coding agents' hand-written installs, and the one prompt for an app.                                                                                                                                                     |
| `components/GetStartedRow`          | The top row by step, the panel standing in for the card or the row, and the lazy-loaded `IntegrationsPanel`.                                                                                                                 |
| `components/SetupCard`              | The setup tile: the app's or the agent's setup while it listens, then the receipt with `NextStep` beside it.                                                                                                                 |
| `components/JobsGrid`               | The four jobs below, locked until the first trace.                                                                                                                                                                           |
| `components/*`                      | One component each; the folder name says which.                                                                                                                                                                              |
| `../../integrations`                | The catalog generated from langfuse-docs, its search and logos.                                                                                                                                                              |

## The state machine

1. `wayIn` → `pickWay` → `setup` (keys are created if there are none), or `startDemo` → `demo` → `leaveDemo` / `pickWay`.
2. `setup` → `pickWay` switches in place: the `.env` copy check stays, the setup's resets.
3. Any step → `traceArrived` → `traceIn`; a pick for this project closes, and later traces wait in `newer` for `showNewest`.
4. In `traceIn`: skip and resume gates, connect a model → pick a judge → scored, and `traceOpened` brings the other way in back, in a new project.
5. `shouldAnimate` turns on with the first pick or step change and never turns off, so a page that opens on a step shows it still.

## The gates

- `nothingBroken`: no step of the trace failed.
- `usableData`: the trace is complete enough for cost, scores and the playground: its LLM calls are generations, their model has a price, and it has an input and output.
- `keepsWorking`: an evaluator scores new traces.
- `shared`: someone else has joined the project. The project counts as set up without it.

That the data is the app's needs no gate: the trace on screen is it.
