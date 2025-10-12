const translation = {
  pages: {
    title: "Prompts",
    description: "Manage and version your prompts in Langfuse. Edit and update them via the UI and SDK. Retrieve the production version via the SDKs. Learn more in the docs.",
  },
  columns: {
    trace: "Trace",
    generation: "Generation",
    versions: "Versions",
    latestVersionCreatedAt: "Latest Version Created At",
    numberOfObservations: "Number of Observations",
    labels: "Labels",
    medianLatency: "Median latency",
    medianInputTokens: "Median input tokens",
    medianOutputTokens: "Median output tokens",
    medianCost: "Median cost",
    generationsCount: "Generations count",
    traceScores: "Trace Scores",
    generationScores: "Generation Scores",
    lastUsed: "Last used",
    firstUsed: "First used",
  },
  form: {
    prompt: "Prompt",
    definePromptTemplate:
      "Define your prompt template. You can use {{variable}} to insert variables into your prompt. Note: Variables must be alphabetical characters or underscores. You can also link other text prompts using the plus button.",
    text: "Text",
    chat: "Chat",
    nameDescription: "Use slashes '/' in prompt names to organize them into folders.",
    namePlaceholder: "Name your prompt",
    createNewVersionHere: "Create a new version for it here.",
    commitMessagePlaceholder: "Add commit message...",
  },
  buttons: {
    createPrompt: "Create prompt",
    newPrompt: "New prompt",
    reviewChanges: "Review changes",
    saveNewPromptVersion: "Save new prompt version",
    addCustomLabel: "Add custom label",
    saveAndPromoteToProduction: "Save and promote to production",
    saveAndRemoveFromProduction: "Save and remove from production",
  },
  validation: {
    enterWhetherPromptLive: "Enter whether the prompt should go live",
    configNeedsValidJson: "Config needs to be valid JSON",
    placeholderNameValidation: "Placeholder name must start with a letter and contain only alphanumeric characters and underscores",
    enterChatMessage: "Enter a chat message or remove the empty message",
    nameRequired: "Name is required",
  },
  labels: {
    prompt: "Prompt",
    message: "Message",
    placeholder: "Placeholder",
    deletePlaceholder: "Delete placeholder",
    unnamedPlaceholder: "Unnamed placeholder",
  },
  delete: {
    confirmMessage: "This action permanently deletes this prompt. All requests to fetch prompt",
    willError: "will error",
    button: "Delete Prompt",
  },
  errors: {
    placeholderNameConflicts: "Placeholder name conflicts with variable. Names must be unique.",
    projectIdMissing: "Project ID is missing",
  },
  hints: {
    addsPlaceholderToInject: 'Adds a placeholder to inject message pairs, e.g. a message history (with "role", "content" pairs) when compiling the message in the SDK.',
  },
  actions: {
    duplicatePrompt: "Duplicate prompt",
  },
  metrics: {
    noLinkedGenerationYet: "No linked generation yet",
    trace: "Trace",
    generation: "Generation",
    prompts: "Prompts",
    description: "You can use this prompt within your application through the Langfuse SDKs and integrations. Refer to the documentation for more information.",
  },
  versionHandler: {
    updatePrompt: "Update Prompt",
    latestLabelReserved: "Label 'latest' is always assigned to the latest prompt version",
  },
  protectedLabels: {
    title: "Protected Prompt Labels",
    description: "Protected labels can only be modified by users with admin or owner access. This prevents other users from changing or removing these labels from prompts.",
  },
  detail: {
    textPrompt: "Text Prompt",
  },
};

export default translation;
