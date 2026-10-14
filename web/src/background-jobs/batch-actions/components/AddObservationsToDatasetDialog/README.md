# Dataset creation from observations

- `index.tsx` owns the modal and its immutable opening source selection. It loads
  dataset metadata and the appropriate v3/v4 preview; table selection is cleared
  only after a batch is accepted, without changing the progress view's source.
- `datasetMappingStore.ts` owns the selected dataset ID, mapping drafts, create
  screen and submission state. Schema defaults are prepared when a dataset is
  selected or created, never when a field mounts or metadata refetches.
- `DatasetMappingEditor.tsx` subscribes to mapping drafts and renders the mapping
  editor shell, keeping field edits out of the modal's query/lifecycle owner.
- `DatasetCreateStep.tsx` adapts the shared dataset form. The form owns its
  submission and footer; event callbacks guard modal dismissal and return the
  newly created dataset to the mapping store without a validation-state bridge.
- `prepareDatasetMapping.ts` produces values, JSONPath warnings and validation for
  all fields. The editor, preview and submission action use this same result;
  there are no child-to-parent validation effects.
- `submitDatasetBatch.ts` guards duplicate or invalid submissions and calls the
  existing batch API. Failure retains the draft and selection; the tRPC mutation
  reports the error. The worker remains responsible for all selected items.
- `DatasetItemEditorLayout` in the datasets feature contains the bulk selector,
  mapping editor and sample preview, followed by background progress after
  submission. Single-object creation uses `NewDatasetItemForm` with one column
  of editable JSON, multiple datasets, schema checks and media uploads, then
  calls the existing immediate creation API. Both flows reuse dataset creation;
  their item editors and submission adapters stay separate.

The existing single-item submit analytics and evaluation analytics remain at
their intent seams. Layout changes and cancellation do not add analytics events.
