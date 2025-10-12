const translation = {
  auditLogs: {
    title: "Audit Logs",
    description:
      "Track who changed what in your project and when. Monitor settings, configurations, and data changes over time. Reach out to the Langfuse team if you require more detailed/filtered audit logs.",
    enterpriseFeature: "Audit logs are an Enterprise feature. Upgrade your plan to track all changes made to your project.",
    table: {
      timestamp: "Timestamp",
      resourceType: "Resource Type",
      resourceId: "Resource ID",
      action: "Action",
      before: "Before",
      after: "After",
    },
  },
  usageAlerts: {
    saveChanges: "Save Changes",
    updated: "Usage alerts updated",
    updatedDescription: "Your usage alert settings have been saved successfully.",
    updateFailed: "Failed to update usage alerts",
    invalidEmail: "Invalid email address",
    invalidEmailDescription: "Please enter a valid email address.",
    emailAlreadyAdded: "Email already added",
    emailAlreadyAddedDescription: "This email address is already in the recipient list.",
    enterEmailPlaceholder: "Enter email address",
  },
  serverErrors: {
    methodNotAllowed: "Method Not Allowed",
    internalServerError: "Internal Server Error",
  },
};

export default translation;
