const translation = {
  pages: {
    title: "用户",
    description: "通过向您的跟踪添加 userId 将 Langfuse 中的数据归因于用户。查看文档了解更多信息。",
  },
  filters: {
    timestamp: "时间戳",
  },
  tabs: {
    traces: "跟踪",
    sessions: "会话",
    scores: "评分",
  },
  noTraces: "暂无跟踪",
  table: {
    userId: "用户 ID",
    userIdDescription: "在 Langfuse 中记录的用户唯一标识符。查看文档了解如何设置此标识符的更多详细信息。",
    firstEvent: "首次事件",
    firstEventDescription: "为此用户记录的最早跟踪。",
    lastEvent: "最后事件",
    lastEventDescription: "为此用户记录的最新跟踪。",
    totalEvents: "总事件数",
    totalEventsDescription: "用户的总事件数，包括跟踪和观察。查看数据模型了解更多详细信息。",
    totalTokens: "总令牌数",
    totalTokensDescription: "用户在所有生成中使用的总令牌数。",
    totalCost: "总成本",
    totalCostDescription: "用户在所有生成中的总成本。",
    noEventYet: "暂无事件",
  },
};

export default translation;
