# Skill management

- `components/SkillsPage.tsx` owns the project list surface.
- `components/SkillEditorPage.tsx` owns each mounted draft store, gates rendering
  on the selected server version, and derives creation-page metadata from the
  local `SKILL.md` draft.
- `components/SkillEditor.tsx` renders the draft workspace and narrow store consumers.
- `components/SkillFileExplorer.tsx` owns draft file-tree presentation,
  expansion, and inline file/folder creation.
- `components/skillFileTree.ts` compiles flat persisted paths and local empty
  folders into the explorer tree.
- `components/SkillVersionHistory.tsx` owns collapsible version navigation, per-version labels, and the dirty-draft guard.
- `components/SkillMetadataSelect.tsx` owns prompt-style controlled label and tag selection.
- `components/CreateSkillVersionDialog.tsx` owns version-note confirmation before persistence.
- `components/skillEditorStore.ts` owns one editor draft per mounted version.
- `actions/createSkillVersion.ts` owns hashing, signed uploads, and version creation.
- `actions/downloadSkillVersion.ts` fetches one persisted version through signed
  file URLs and packages its files as a ZIP in the browser.
- `actions/saveSkillLabels.ts` owns direct label updates on an existing version.
- `actions/saveSkillTags.ts` owns direct tag updates on an existing version.
- `utils/parseSkillFrontmatterMetadata.ts` tolerantly derives draft header
  metadata while a user edits frontmatter.
- `server/skill-service.ts` owns persistence, storage verification, and audit writes.

Draft file contents and empty folders stay client-side until the user explicitly
creates a version. Persisted folders are implicit in file paths, so an empty
folder exists only for the mounted draft until it contains a file. A selected
server version is immutable and only seeds a newly mounted editor store. Labels
and tags are mutable version metadata and are saved independently. Skill
identity and description are derived from `SKILL.md` frontmatter when a version
is created. Drag-and-drop uploads are intentionally left as the next explorer
slice.
