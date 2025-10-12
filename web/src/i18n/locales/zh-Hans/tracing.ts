const translation = {
  trace: {
    pages: {
      title: "跟踪",
      description: "跟踪表示单个函数/API 调用。跟踪包含观察。查看文档了解更多信息。",
    },
    actions: {
      deleted: "跟踪已删除",
      deletedDescription: "选定的跟踪将被删除。跟踪是异步删除的，可能继续可见最多 15 分钟。",
      search: "搜索",
      collapseAll: "全部折叠",
      expandAll: "全部展开",
      downloadAsJson: "下载跟踪为 JSON",
    },
    errors: {
      notFound: "未找到跟踪",
      notFoundDescription: "跟踪仍在处理中或已被删除。",
      sdkUpgradeRequired: "请升级 SDK，因为 URL 架构已更改。",
      noAccess: "您无权访问此跟踪。",
    },
    ids: {
      traceId: "跟踪 ID",
      observationId: "观察 ID",
      copyId: "复制 ID",
    },
    io: {
      input: "输入",
      output: "输出",
      statusMessage: "状态消息",
      additionalInput: "附加输入",
      placeholder: "占位符",
      unnamedPlaceholder: "未命名占位符",
      hideHistory: "隐藏历史",
    },
    breakdown: {
      costBreakdown: "成本分解",
      usageBreakdown: "使用分解",
      inputCost: "输入成本",
      outputCost: "输出成本",
      inputUsage: "输入使用",
      outputUsage: "输出使用",
      totalCost: "总成本",
      totalUsage: "总使用",
      otherCost: "其他成本",
      otherUsage: "其他使用",
    },
    observation: {
      viewModelDetails: "查看模型详情",
      aggregatedDuration: "所有子观察的聚合持续时间",
      aggregatedCost: "所有子观察的聚合成本",
    },
    common: {
      metadata: "元数据",
      viewOptions: "视图选项",
      traces: "跟踪",
    },
  },
  observation: {
    pages: {
      title: "跟踪",
      description: "观察捕获应用程序中的单个函数调用。查看文档了解更多信息。",
    },
  },
  session: {
    pages: {
      title: "会话",
      description: "会话是相关跟踪的集合，例如对话或线程。首先，向跟踪添加 sessionId。",
    },
  },
};

export default translation;
