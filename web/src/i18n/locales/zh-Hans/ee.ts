const translation = {
  auditLogs: {
    title: "审计日志",
    description: "跟踪谁在您的项目中更改了什么以及何时更改。监控设置、配置和数据随时间的变化。如果您需要更详细/过滤的审计日志，请联系 Langfuse 团队。",
    enterpriseFeature: "审计日志是企业功能。升级您的计划以跟踪对项目所做的所有更改。",
    table: {
      timestamp: "时间戳",
      resourceType: "资源类型",
      resourceId: "资源 ID",
      action: "操作",
      before: "之前",
      after: "之后",
    },
  },
  usageAlerts: {
    saveChanges: "保存更改",
    updated: "使用警报已更新",
    updatedDescription: "您的使用警报设置已成功保存。",
    updateFailed: "更新使用警报失败",
    invalidEmail: "无效的邮箱地址",
    invalidEmailDescription: "请输入有效的邮箱地址。",
    emailAlreadyAdded: "邮箱已添加",
    emailAlreadyAddedDescription: "此邮箱地址已在收件人列表中。",
    enterEmailPlaceholder: "输入邮箱地址",
  },
  serverErrors: {
    methodNotAllowed: "方法不允许",
    internalServerError: "内部服务器错误",
  },
};

export default translation;
