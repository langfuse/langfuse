class LangFuseClient {
  constructor(config) {
    this.baseUrl = config.baseUrl || "https://cloud.langfuse.com";
    this.apiKey = config.apiKey;
    this.projectId = config.projectId;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LangFuse API Error ${response.status}: ${errorText}`);
    }

    return response.json();
  }

  // 获取 Trace 列表
  async getTraces(params = {}) {
    const queryParams = new URLSearchParams({
      projectId: this.projectId,
      page: params.page || 1,
      limit: params.limit || 50,
      ...params,
    });

    return this.request(`/api/public/traces?${queryParams}`);
  }

  // 获取单个 Trace 详情
  async getTrace(traceId) {
    return this.request(`/api/public/traces/${traceId}`);
  }

  // 获取 Trace 指标
  async getTraceMetrics(params = {}) {
    const queryParams = new URLSearchParams({
      projectId: this.projectId,
      ...params,
    });

    return this.request(`/api/public/metrics/traces?${queryParams}`);
  }
}

module.exports = LangFuseClient;
