# Comments

- `CommentDrawerController` resolves the selected target before opening a compact first-comment dialog or an existing conversation drawer. Deep links open the drawer. It owns overlay dismissal, draft guards, and comment URL cleanup.
- `CommentList` reads and searches the conversation and handles deletion/reactions. A keyed thread resets local state when its target changes; background query failures retain the cached conversation and draft.
- `CommentComposer` owns creation, validation, draft notifications, inline selection, and mention suggestions. Suggestions float at the editor cursor and portal inside the active dialog to preserve its accessibility and focus boundary.
- `CommentEditor` stores plain Markdown while displaying mentions as atomic chips. `mentionParser` defines the stored mention format; server sanitization remains authoritative.
- `CommentCard` renders a conversation entry without fetching data. Cards, editors, and mention suggestions block customer content from session replay.
- `validateCommentReferenceObject` verifies targets using the session's observation read path. Public API contexts retain the repository routing wrapper.
