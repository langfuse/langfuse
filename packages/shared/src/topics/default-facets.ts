export const DEFAULT_TOPIC_FACETS = [
  {
    name: "Intent",
    description: "What the run was asked to do.",
    prompt: `Describe what the user, or the calling application, wanted from this run as a whole.

Format: an imperative verb phrase stating the goal, such as "Find…", "Fix…", "Summarize…".

- Describe the goal of the whole run, not its last step. Follow-up requests to verify, save, show, fix, or reformat earlier work belong to the goal they serve.
- A run can contain several unrelated requests, for example a user who finishes one job and then starts another. Name each of them in a few words, in the order they were asked, joined with "and". Describing only the latest request misses the earlier ones.
- Earlier conversation can clarify the goals of this run but does not add goals of its own.
- In an automated run with no human author (extraction, classification, routing, templated generation), describe the job the input sets. Do not invent a person asking for it.
- When the user asks the assistant to work on supplied material, describe that work and name the material's subject in a few words.
- Keep the user's own verb and object. "Fix the date filter in a SQL query" must not become "Improve a data workflow".
- Describe goals only. Leave out how the assistant approached them, what went wrong, and whether they succeeded.
- Social or casual messages have a goal too; state it plainly.

Status: applicable whenever a goal can be identified, even if the run failed or produced nothing. insufficient_input when no request or input survives. Do not use not_applicable.

Examples:
- Export last quarter's orders to CSV grouped by region.
- Classify an inbound support email by product area and urgency.
- Fix a failing nightly data import and draft a welcome email for new customers.
- Chat about plans for the weekend.`,
  },
  {
    name: "Sentiment",
    description: "How the end user felt about the interaction.",
    prompt: `Describe how the end user felt about this interaction and what the feeling was directed at.

Format: "<Label>: <cue and its target>", where Label is one of:
- Positive: thanks, praise, relief, or warm engagement.
- Negative: frustration, annoyance, distrust, or giving up.
- Mixed: both are substantial, for example annoyance that turns into relief.
- Neutral: factual or procedural messages with no emotional signal.

- Judge only text the end user wrote. Assistant, tool, and system text shows what the user reacts to, never how the user feels.
- Judge the attitude toward the interaction, not the subject. A calm report of a bug, a failed test, or a personal hardship is not negative by itself.
- Weight sustained tone and how the user ends over a single remark. Terse or strict instructions are Neutral; so is routine politeness.
- Name the target in terms of the assistant's behavior (wrong answers, slow progress, ignored corrections, a working fix), not the user's private circumstances.

Status: not_applicable when the run has no end-user text, as in automated pipelines. insufficient_input when user text exists but is unreadable.

Examples:
- Negative: user repeated the same formatting correction and said the assistant keeps ignoring it.
- Positive: user thanked the assistant after a working fix for a failing deployment script.
- Mixed: user was annoyed by two wrong answers, then relieved when the third one worked.
- Neutral: user gave step-by-step instructions without emotional cues.`,
  },
  {
    name: "Outcome",
    description: "Where the run ended and whether that is confirmed.",
    prompt: `Describe where this run ended: what was delivered or done, and whether the transcript confirms it.

Format: "<State>: <the concrete result>", where State is one of:
- Completed: the requested answer was given, or a tool result confirms the requested action.
- Partial: part of the request was delivered and part was not.
- Unconfirmed: the assistant says an action happened, but no result confirms it.
- Needs input: the run ends waiting on the user, such as a clarifying question or an approval.
- Not completed: the run stopped, was blocked, or was declined without delivering the request.

- Start from the end of this run: the last assistant message and the last tool results decide the state.
- Base the state on results, not on the assistant's words. A tool result confirms an action; a message saying "done" does not. A returned draft is a delivered draft, not a sent message.
- For questions, explanations, and analyses, the delivered answer is the result.
- Name the concrete deliverable or stopping point, not just the state. Mention remaining work only when the transcript shows it.
- Say where the run stopped, not why something failed, unless the reason is itself the result, as with a declined request.

Status: applicable whenever the run has a final response or result, including failures. insufficient_input when no response or result survives. Do not use not_applicable.

Examples:
- Completed: returned a SQL query that filters orders by signup month.
- Unconfirmed: said the meeting was booked, but no calendar tool result confirms it.
- Needs input: asked which of two accounts the transfer should come from.
- Not completed: stopped after the payments tool failed, without answering the user.`,
  },
  {
    name: "Issues",
    description: "The main problem in how the run was handled.",
    prompt: `Describe the problem that did the most damage to the result of this run: the mistake that made the final answer or action wrong, unsupported, or missing.

Format: one sentence that names the mistake, the kind of step where it happened, and its consequence, for example "Answered from memory instead of querying the dataset, so the reported value is unverified."
- Describe the mechanism in plain, generic words: what the assistant did wrong and how, such as answering from memory, inventing data, claiming a check that never ran, choosing the wrong tool, breaking a required format, or stopping before the answer. Use the words that fit this run.
- Name the kind of step (a web search, a file read, a calculation, a code change, the final answer), not the task's subject. "Skipped the file read and guessed the count" is right; "gave a wrong count of crustacean slides" is not.
- Do not start with a label or category.

How to find it:
- Start from the end. Check the final answer or action against the request: is it on target, complete, and backed by what the run actually retrieved or did? Then work back to the step that caused the gap.
- Report the cause with its consequence, not the symptom. When a tool fails and the assistant then answers anyway from guesses or invented data, the problem is the unsupported answer, not the tool failure.
- When several problems occur, report the one with the biggest effect on the result. Prefer, in this order: an answer or reported result that is wrong or not backed by the run; a task left unfinished or answered off target; a wrong tool, approach, or argument; a broken instruction or format; a tool failure that blocked the result. A problem the assistant fully recovered from counts only when nothing worse happened.
- Keep the symptoms of one problem together; do not list separate problems.

Before you return not_applicable, check these four points. Return not_applicable only when all of them hold:
1. When the request depends on data, files, tools, or current facts that the run had to look up, every such fact, number, or result in the final answer comes from a tool result or user input in this run, not from memory or assumption. General knowledge, explanations, and writing do not need a lookup.
2. Every tool call used a tool suited to its input, such as a file tool on a local file rather than a web address, with valid arguments.
3. The run followed the output format, tags, and steps that the system prompt or the assistant's own plan required.
4. The final answer addresses exactly what was asked: the right quantity, unit, entity, and scope.

- Only problems in this run count. An error the user pastes for explanation, a problem in earlier conversation, or a complaint about something outside the run is not an issue here.
- A clarifying question, a justified refusal, a short answer, and a retry that succeeds are not issues.
- Check the end of this run before calling it unfinished: if a later assistant message delivers an answer or fallback, the run is finished.
- Report only what the transcript shows directly. A run-specific fact that needed a lookup but has none is shown directly. A problem that is only a possibility is not.

Status: not_applicable when the run is complete enough to judge and shows no problem. insufficient_input when too much is missing to judge, for example only the first request survives.

Examples:
- Answered from a made-up example after the data file could not be read, so the reported result is invented.
- Reported the total instead of the requested minimum, so the answer misses the question.
- Searched the web for figures the attached spreadsheet contained, so the answer used outdated data.
- Every inventory lookup timed out, so no quote could be produced and the user was asked to retry later.`,
  },
];
