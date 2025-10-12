const translation = {
  messages: {
    surveySubmitted: "Survey submitted",
    thankYou: "Thank you for your feedback!",
  },
  errors: {
    submitFailed: "Failed to submit survey",
    tryAgainLater: "Please try again later.",
  },
  pages: {
    title: "Get Started",
    description: "Create an organization to get started. Alternatively, ask your organization admin to invite you.",
    noAccessDescription: "You need to get invited to an organization to get started with Langfuse.",
  },
  buttons: {
    newOrganization: "New Organization",
    docs: "Docs",
    askAI: "Ask AI",
  },
  setup: {
    title: "Setup",
    helpDescription: "Create a new organization. This will be used to manage your projects and teams.",
    steps: {
      createOrganization: "1. Create Organization",
      inviteMembers: "2. Invite Members",
      createProject: "3. Create Project",
      setupTracing: "4. Setup Tracing",
    },
    organization: {
      title: "New Organization",
      description: "Organizations are used to manage your projects and teams.",
    },
    members: {
      title: "Organization Members",
      description: "Invite members to your organization to collaborate on projects. You can always add more members later.",
    },
    project: {
      title: "New Project",
      description: "Projects are used to group traces, datasets, evals and prompts. Multiple environments are best separated via tags within a project.",
    },
    apiKeys: {
      title: "API Keys",
      description: "These keys are used to authenticate your API requests. You can create more keys later in the project settings.",
      needToCreate: "You need to create an API key to start tracing your application.",
      createButton: "Create API Key",
    },
    tracing: {
      title: "Setup Tracing",
      description: "Tracing is used to track and analyze your LLM calls. You can always skip this step and setup tracing later.",
    },
    buttons: {
      next: "Next",
      openDashboard: "Open Dashboard",
      skipForNow: "Skip for now",
    },
  },
};

export default translation;
