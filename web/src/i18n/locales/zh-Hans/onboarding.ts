const translation = {
  messages: {
    surveySubmitted: "调查已提交",
    thankYou: "感谢您的反馈！",
  },
  errors: {
    submitFailed: "提交调查失败",
    tryAgainLater: "请稍后重试。",
  },
  pages: {
    title: "开始使用",
    description: "创建组织以开始使用。或者，请您的组织管理员邀请您。",
    noAccessDescription: "您需要被邀请加入组织才能开始使用 Langfuse。",
  },
  buttons: {
    newOrganization: "新组织",
    docs: "文档",
    askAI: "询问 AI",
  },
  setup: {
    title: "设置",
    helpDescription: "创建新组织。这将用于管理您的项目和团队。",
    steps: {
      createOrganization: "1. 创建组织",
      inviteMembers: "2. 邀请成员",
      createProject: "3. 创建项目",
      setupTracing: "4. 设置跟踪",
    },
    organization: {
      title: "新组织",
      description: "组织用于管理您的项目和团队。",
    },
    members: {
      title: "组织成员",
      description: "邀请成员加入您的组织以在项目上协作。您可以随时添加更多成员。",
    },
    project: {
      title: "新项目",
      description: "项目用于分组跟踪、数据集、评估和提示。多个环境最好通过项目内的标签来分隔。",
    },
    apiKeys: {
      title: "API 密钥",
      description: "这些密钥用于验证您的 API 请求。您可以稍后在项目设置中创建更多密钥。",
      needToCreate: "您需要创建 API 密钥才能开始跟踪您的应用程序。",
      createButton: "创建 API 密钥",
    },
    tracing: {
      title: "设置跟踪",
      description: "跟踪用于跟踪和分析您的 LLM 调用。您可以随时跳过此步骤并稍后设置跟踪。",
    },
    buttons: {
      next: "下一步",
      openDashboard: "打开仪表板",
      skipForNow: "暂时跳过",
    },
  },
};

export default translation;
