# Playground

The page controller and session storage live in `page/context` and
`page/storage`. `page/components/JumpToPlaygroundDropdownMenuController.tsx`
prepares prompt or generation state for the existing Playground windows.

## Replay a generation with a managed prompt

For a generation linked to a managed prompt, the Playground menu can use its
compiled messages, its recorded prompt version, or the latest stored prompt
version. The latest version is selected by version number, not a deployment
label. Prompt dependencies are resolved before opening the Playground.

Prompt replay is opt-in. Record the original variables in generation metadata:

```json
{
  "promptVariables": {
    "topic": "structured logging",
    "language": "English"
  }
}
```

All values must be strings. The UI never tries to reconstruct variables from
compiled messages. Missing or malformed values leave the prompt replay options
disabled with an explanation; the existing compiled-message action is unchanged.

Open the generation's Playground menu, select **Recorded prompt** or
**Latest prompt version**, then choose **Fresh playground** or **Add to existing**.
Variables introduced by a newer prompt start empty and must be filled before
execution. Unused recorded variables are not copied. Model, tools, and structured
output settings are retained; recorded assistant output is not appended to a
prompt template.

Adding a replay to existing windows preserves edited variable values. A window
is reused only when both its messages and variable values match; otherwise a
separate window is opened.

The existing project-scoped prompt read endpoints enforce access. If loading or
resolving a prompt fails, the current Playground cache is not cleared and no
navigation occurs.

`page/utils/promptReplay.ts` owns metadata validation and prompt selection.
Variable values use the existing session cache and protected variable inputs.
Analytics records only the input-source enum and variable count, never metadata,
variable names, values, or prompt content.
