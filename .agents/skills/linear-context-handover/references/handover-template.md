# Handover block template

Append this to the ticket's **description**, below the human's prose, separated by
a rule. Never edit the text above it. Label the ticket `AI edited`.

Keep the headings you have content for and drop the rest — an empty section is
worse than no section. Quote the human verbatim where a decision hinged on a
phrase; a paraphrase loses the force of it.

```markdown
---

## 🤖 AI post-context

*Written by <agent> on <date>. Everything above this line is human-authored.*

### What shipped

One paragraph, then the PR numbers. Include the thing that was **not** obvious
from the diff — the surface nobody tested, the path that changed by accident.

### Decisions, and why — reversals included

1. **<Decision>.** The reasoning, and the evidence if there was any. If it was
   reversed later, say so here rather than leaving the first version to be found
   and trusted.
2. **<Thing that was built and then deliberately removed>.** What replaced it, or
   why nothing did. Name where the deleted code can be recovered from.

### How the human steered

- What they were reacting to, and the redirect, quoted.
- What they refuse outright (half-baked mechanisms, a particular register of
  writing, a class of solution).
- How they prefer to decide — from renders, from numbers, from a live click-path.

### Tools and recipes

The commands and fixtures that produced the work: seeder scenario, test command,
analytics query, browser trick. Enough that the next agent reproduces the state
instead of rebuilding it.

### Traps

The failures that cost time and would cost it again. One line each, cause first.

### Left open

- <Ticket id> — <what remains>
- <Unticketed follow-up>, and why it was not done
```

## Pointer block, for leaf tickets

```markdown
---

## 🤖 AI post-context

*Written by <agent> on <date>.*

<One or two decisions specific to THIS ticket.>

Full handover for the effort: <TICKET-ID>.
```

## What not to put in it

- A changelog of the diff. The PR already has that.
- Status updates ("in progress", "merged"). The state field has that.
- The same essay copied onto every ticket in the project.
- Anything confidential in a place that syncs outward: no customer names, no
  support-ticket ids, no vendor references that the public PR rules already ban.
