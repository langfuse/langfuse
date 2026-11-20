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
    description: "How the end user felt about the responses they got.",
    prompt: `Describe how the end user felt about the responses they got, from an assistant, agent or application, and how they expressed it. Do not describe what the conversation was about.

Format: "<Label>: user <expression> <target>." with Label one of Negative, Positive, Mixed, Neutral.

Decide in this order, looking at what the end user wrote in this run, above all their last message:
1. Negative if the user shows dissatisfaction with the assistant, even calmly or in a few words: says its answer or fix is wrong or did not work ("still failing", "it gives a compile error", "not this"), corrects or overrides what it did ("no, I meant …", "do not do that"), repeats or tightens an earlier instruction, objects to how it answered ("too long, just say yes or no"), asks why it did something unexpected, or shows frustration, distrust, or giving up.
2. Positive if the user approves the result ("perfect", "cool", "looks good", "good work"), shows relief or warmth, or thanks the assistant in a message that is mainly thanks ("thanks", "thank you and good night"). Approval stays Positive when a new request follows.
3. Mixed if both 1 and 2 hold and both matter.
4. Otherwise Neutral: requests, first instructions even when terse or strict, answers to the assistant's questions, factual questions, and a "thanks" that only opens the next request ("Thanks. Next, …").

- Only text the end user wrote counts as a signal. Assistant, tool, and system text shows what the user reacts to.
- A calm report of a problem the assistant did not cause, such as a bug the user brings in or a personal hardship, is not negative by itself.
- Expression, pick the closest. Negative: reported that … failed, corrected, repeated an instruction after, objected to, complained about, questioned, gave up on. Positive: approved, praised, thanked the assistant for, was relieved by. Mixed: one Positive and one Negative expression joined by "but".
- Target, pick the closest: a wrong or unsupported answer, a fix or action that did not work, an ignored instruction, an unwanted action, the answer's length or format, slow or repeated attempts, the result, the help overall.
- Never name the task's subject, domain, product, code, files, data, people, or the user's circumstances. Those belong to other facets.
- For Neutral, name only the kind of message (a procedural request, an answer to a question, a factual question), not its subject, so that neutral runs read alike.

Status: not_applicable when the run has no end-user text, as in automated pipelines. insufficient_input when user text exists but is unreadable.

Examples:
- Negative: user reported that a fix failed again.
- Negative: user objected to an unwanted action.
- Negative: user repeated an instruction the assistant ignored.
- Positive: user approved the result.
- Mixed: user praised the result but corrected a wrong answer.
- Neutral: user gave a procedural request.`,
  },
  {
    name: "Outcome",
    description: "Where the run ended and whether that is confirmed.",
    prompt: `Describe where this run ended: what was delivered or done, and whether the transcript confirms it.

Format: "<State>: <the concrete result>", where State is one of:
- Not supported: the main request needs something the assistant, its tools or the application cannot do, and the run shows it, including a correct "no" to a "can I …?" question and a run that only offers a workaround.
- Partial: part of the request was delivered and part was not, including a delivered workaround that covers part of an unsupported request.
- Needs input: the run ends waiting on the user for a clarification or an approval, and the request itself is possible.
- Unconfirmed: the assistant says an action happened, but no result confirms it.
- Completed: the request was possible, and the requested answer was given or a tool result confirms the requested action.
- Not completed: the run stopped, was blocked, or was declined without delivering a possible request.

Decide in this order, starting from the end of this run (the last assistant message and the last tool results):
1. Not supported if the main request needs a capability that the assistant, its tools or the application lacks, and the run shows that. This includes a user who asks whether something is possible ("can I …?") and gets a correct "no", and a run that only offers a workaround for the user to choose or confirm.
2. Partial if part of the request was delivered, including a delivered workaround that covers part of an unsupported request.
3. Needs input if the run ends waiting on the user for a clarification or an approval, and the request itself is possible.
4. Unconfirmed if the assistant says an action happened but no result confirms it.
5. Completed if the requested answer was given or a tool result confirms the requested action.
6. Otherwise Not completed.
- Base the state on results, not on the assistant's words. A tool result confirms an action; a message saying "done" does not. A returned draft is a delivered draft, not a sent message.
- For questions, explanations, and analyses, the delivered answer is the result.
- Name the concrete deliverable or stopping point, not just the state. Mention remaining work only when the transcript shows it.
- Say where the run stopped, not why something failed, unless the reason is itself the result, as with a declined request.
- Use Not supported only when the transcript shows the capability is missing: the assistant states the limitation, or a tool rejects the unsupported option. A run that tries and fails, gives up, or attempts an unsupported option and returns a wrong or partial result is Not completed or Partial, not Not supported.
- For Not supported, name the kind of capability that is missing (a chart type, an export format, a widget option, editing a read-only item), not the user's data.

Status: applicable whenever the run has a final response or result, including failures. insufficient_input when no response or result survives. Do not use not_applicable.

Examples:
- Completed: returned a SQL query that filters orders by signup month.
- Unconfirmed: said the meeting was booked, but no calendar tool result confirms it.
- Needs input: asked which of two accounts the transfer should come from.
- Not completed: stopped after the payments tool failed, without answering the user.
- Not supported: explained that the requested export format is not available and offered no workaround.
- Not supported: answered that filtering by a custom field is not possible and offered to build a broader filter instead.`,
  },
  {
    name: "Issues",
    description: "The main problem in how the run was handled.",
    prompt: `Describe the problem that did the most damage to the result of this run: the mistake that made the final answer or action wrong, unsupported, or missing.

Format: one sentence shaped "<what went wrong> in <kind of step>, so <consequence>", for example "Answered from memory instead of using the lookup result in the final answer, so the reported value is unsupported."
- What went wrong: name the mechanism in generic words, such as answered without support, invented data, misread a tool result, used the wrong tool, passed a wrong argument, skipped a required step, stopped before finishing, ignored an instruction, broke the required format, or claimed an action that did not happen.
- Kind of step: use a generic kind, such as a tool call, a search, a file read, a file edit, a code change, a calculation, an account or booking action, a clarification, or the final answer.
- Consequence: what this did to the result in generic words (wrong, unsupported, incomplete, or missing).
- Never name the task's subject or domain: no products, places, organizations, software projects, file names, commands, or topics.
- Do not start with a label or category.

Decide in this order:
1. Find the result: the final answer the user received, or the final action the run took (an edit, a booking, a submitted change). If the run ends with no answer and no action although the request needed one, the issue is the missing result.
2. Check the result against the request. It is wrong if it states something the run's own tool results or the user contradict, answers a different question, quantity or entity, or claims an action that did not happen. It is incomplete if a required part of the request is missing. It is unsupported only if it states a run-specific fact that no tool result or user input in this run provides. It is also wrong if it breaks a required output format or an explicit instruction from the system prompt or the user.
3. If the result is right, complete and supported, return not_applicable, even when earlier steps failed and were recovered, an optional check was skipped, or the path was clumsy.
4. If the result is wrong, incomplete or unsupported, work back to the step that caused it and report that cause with its consequence. When several problems contributed, report the one with the biggest effect.

- Only problems in this run count; an error the user pastes for explanation or a problem in earlier conversation is not an issue here.
- A clarifying question, a justified refusal, a short answer, and an honest statement that a requested capability is not available are not issues. A capability gap is an issue only when the run mishandled it: it tried anyway and presented a wrong or partial result as complete, failed without telling the user, or claimed something is not possible that the run shows is possible.
- When the result is supported but you cannot tell whether it is right, return not_applicable.

Status: not_applicable when the run is complete enough to judge and its result is right, complete and supported. insufficient_input when too much is missing to judge, for example only the first request survives.

Examples:
- Invented data in the final answer after a failed file read, so the reported result is unsupported.
- Answered a different quantity than requested in the final answer, so the result is wrong.
- Claimed an edit that did not happen in the final answer, so the reported change is wrong.
- Stopped after repeated failures in a tool call without a fallback, so the result is missing.`,
  },
];
