const translation = {
  pages: {
    title: "提示",
    description: "在 Langfuse 中管理和版本化您的提示。通过 UI 和 SDK 编辑和更新它们。通过 SDK 检索生产版本。在文档中了解更多信息。",
  },
  columns: {
    trace: "跟踪",
    generation: "生成",
    versions: "版本",
    latestVersionCreatedAt: "最新版本创建时间",
    numberOfObservations: "观察数量",
    labels: "标签",
    medianLatency: "中位延迟",
    medianInputTokens: "中位输入令牌",
    medianOutputTokens: "中位输出令牌",
    medianCost: "中位成本",
    generationsCount: "生成次数",
    traceScores: "跟踪评分",
    generationScores: "生成评分",
    lastUsed: "最后使用",
    firstUsed: "首次使用",
  },
  form: {
    prompt: "提示",
    definePromptTemplate: "定义您的提示模板。您可以使用 {{variable}} 将变量插入到您的提示中。注意：变量必须是字母字符或下划线。您还可以使用加号按钮链接其他文本提示。",
    text: "文本",
    chat: "聊天",
    nameDescription: "在提示名称中使用斜杠 '/' 将它们组织到文件夹中。",
    namePlaceholder: "为您的提示命名",
    createNewVersionHere: "在此处为其创建新版本。",
    commitMessagePlaceholder: "添加提交消息...",
  },
  buttons: {
    createPrompt: "创建提示",
    newPrompt: "新提示",
    reviewChanges: "查看更改",
    saveNewPromptVersion: "保存新的提示版本",
    addCustomLabel: "添加自定义标签",
    saveAndPromoteToProduction: "保存并推广到生产环境",
    saveAndRemoveFromProduction: "保存并从生产环境移除",
  },
  validation: {
    enterWhetherPromptLive: "输入提示是否应该上线",
    configNeedsValidJson: "配置需要是有效的 JSON",
    placeholderNameValidation: "占位符名称必须以字母开头，只能包含字母数字字符和下划线",
    enterChatMessage: "输入聊天消息或删除空消息",
    nameRequired: "名称是必需的",
  },
  labels: {
    prompt: "提示",
    message: "消息",
    placeholder: "占位符",
    deletePlaceholder: "删除占位符",
    unnamedPlaceholder: "未命名占位符",
  },
  delete: {
    confirmMessage: "此操作将永久删除此提示。所有获取提示的请求",
    willError: "将出错",
    button: "删除提示",
  },
  errors: {
    placeholderNameConflicts: "占位符名称与变量冲突。名称必须唯一。",
    projectIdMissing: "项目 ID 缺失",
  },
  hints: {
    addsPlaceholderToInject: '添加占位符以注入消息对，例如在 SDK 中编译消息时的消息历史记录（带有 "role"、"content" 对）。',
  },
  actions: {
    duplicatePrompt: "复制提示",
  },
  metrics: {
    noLinkedGenerationYet: "尚未链接生成",
    trace: "跟踪",
    generation: "生成",
    prompts: "提示",
    description: "您可以通过 Langfuse SDK 和集成在应用程序中使用此提示。请参考文档了解更多信息。",
  },
  versionHandler: {
    updatePrompt: "更新提示",
    latestLabelReserved: "标签 'latest' 始终分配给最新的提示版本",
  },
  protectedLabels: {
    title: "受保护的提示标签",
    description: "受保护的标签只能由具有管理员或所有者访问权限的用户修改。这可以防止其他用户更改或从提示中删除这些标签。",
  },
  detail: {
    textPrompt: "文本提示",
  },
};

export default translation;
