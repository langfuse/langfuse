# Comments

## Surface and entry points

Trace/observation details, sessions, prompts and queue processors mount
`CommentDrawerController`. Dataset comparison mounts `CommentList` inline.
These exports remain usable without a feature provider.

## State ownership

- `CommentDrawerController` creates one local `commentOverlayStore` per mounted
  view. Its children receive actions and permissions; opening, resolving,
  typing and closing do not rerender the owning detail view.
- `CommentOverlayState` subscribes only to the overlay. Route readiness gates
  its initial deep-link seed. `CommentOverlayHost` renders one controlled
  composer dialog or conversation drawer; the chosen presentation stays pinned
  until another explicit open. Counts and query refreshes never select a mode.
- `commentOverlayStore` owns target intent, request identity and dismissal
  guards. Obsolete requests and post callbacks cannot reopen dismissed overlays,
  replace newer selections or discard drafts edited during a lookup. It stores
  no server comments or draft content.
- React Query owns threads, counts and reactions. `refreshCommentQueries`
  refreshes the affected thread/counts and relevant aggregate counts. Reaction
  invalidation targets one comment. Refresh failures stay with query error UI.
- `CommentList` gates its target-keyed thread on permissions and initial data;
  cached data survives background failures. `CommentConversation` owns search
  and history, so search does not wake the composer. `CommentCard` is view-only.
- `CommentComposer` owns the editable RHF draft and mention state. `CommentEditor`
  integrates CodeMirror, preserving Markdown wire text while rendering atomic
  mention chips. No query-to-draft synchronization effect exists.

## Integrations and stability

| Boundary         | Retained integration                                    | Cleanup                       |
| ---------------- | ------------------------------------------------------- | ----------------------------- |
| Conversation     | Scroll to linked/latest comment; window search shortcut | Cancel frame; remove listener |
| Composer         | Capture Escape while mention picker is open             | Remove listener               |
| Mention picker   | Scroll selected suggestion into view                    | DOM-only update               |
| Inline selection | Browser selection, pointer and keyboard events          | Remove listeners/timers       |
| Editor           | CodeMirror lifecycle and extension configuration        | Owned by CodeMirror wrapper   |

Mention suggestions portal inside the active modal. Editors, message cards and
suggestions block customer content from session replay. Server sanitization and
`validateCommentReferenceObject` remain authoritative; target validation uses the
session's observation read path.

## Migration boundaries

Overlay state, history search, server cache and composer drafts are independent.
The trace's aggregate count/inline-highlight queries remain owned by trace views;
refreshing their data legitimately updates those consumers. The shared inline
selection context and browser selection integration remain outside overlay state.
Read the frontend-large-feature-architecture and refactor-react-effects skills
before extending these boundaries.
