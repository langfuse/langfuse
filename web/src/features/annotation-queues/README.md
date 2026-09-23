# Annotation queues

## Surface and entry points

Queue routes under `pages/project/[projectId]/annotation-queues` mount
`components/AnnotationQueuesItem.tsx`. It creates a fresh processing run for
each project and queue; changing the current item keeps the same run history.

## State ownership

- `state/annotationQueueRun.ts` owns one run's visited item locations and progress.
  Its named start, next, back, and complete actions serialize transitions and
  commit navigation and history together. They can run independently of React.
  The current editor stays mounted while transitions are pending or fail;
  navigation controls stay disabled until the action finishes. Failed transitions
  expose a retry action. Confirmed completion IDs survive a failed refresh or
  advance, and an acquired next-item lock survives failed navigation, so retries
  neither complete twice nor acquire a different item.
- `AnnotationQueueItemPage.tsx` adapts tRPC and routing to those actions. A query
  gates initial loading, shares the initial lock during Strict Mode replay, and
  owns cancellation. Actions check that this query still has an active observer
  before navigating, so late responses cannot leave the user's new queue.
- tRPC owns queue/item/object server data. Mutation results populate the item
  cache; the run stores only IDs, initial observation locations, and transition outcomes. Initial
  direct links preserve an explicit observation and single-item mode. Refetches
  do not reset the reviewer's chosen span or trace.
- `processors/TraceAnnotationProcessor.tsx` and `SessionAnnotationProcessor.tsx`
  prepare their object views. They do not initialize the route's selected span.
- Score forms own their field state; the comments feature owns discussion drafts.
  Shared processing layout components own resize preferences.

## Structure and consumers

`components/` contains queue forms, tables, and processing views. `components/shared`
contains object/query adapters and layout primitives; `server/` contains queue and
assignment procedures. Trace/session headers and bulk tables reuse queue-add
controllers. Dataset review reuses the shared comments section.

## Stability and migration

Item query updates may rerender processors, but navigation belongs only to run
actions. The page's remaining effects are keyboard listeners and shortcut timer
cleanup. Queue creation and assignment retry coordination belongs to its dialog
controller: after creation succeeds, retries update that queue with the latest
form values before assigning users. The form keeps its draft across retries and
excludes its own queue from duplicate-name validation.

Read `frontend-large-feature-architecture` and `refactor-react-effects` before
extending processing lifecycle or query-to-form behavior.
