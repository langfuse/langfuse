// LangFuse Trace 监控前端应用

// 演示模式设置 - 当API连接失败时自动启用演示模式显示示例数据
let DEMO_MODE = false;

class LangFuseApp {
  constructor() {
    this.backendUrl = "http://localhost:3008";
    this.currentPage = 1;
    this.pageSize = 50;
    this.selectedTraceId = null;
    this.filters = {};
    this.demoData = null;

    this.init();
  }

  // 生成演示数据
  generateDemoData() {
    const traces = [];
    const now = new Date();

    // 预定义一些有意义的 trace 名称
    const traceNames = [
      "用户查询处理",
      "文档分析任务",
      "代码生成请求",
      "数据分析作业",
      "图像识别任务",
      "文本翻译请求",
      "情感分析处理",
      "推荐系统查询",
      "语音识别任务",
      "聊天机器人对话",
      "SQL查询优化",
      "API调用监控",
      "日志分析任务",
      "性能监控检查",
      "安全扫描任务",
      "备份操作",
      "用户认证请求",
      "数据同步任务",
      "报表生成作业",
      "缓存清理任务",
      "模型训练监控",
      "预测分析任务",
      "异常检测作业",
      "自动化测试",
      "配置更新任务",
    ];

    for (let i = 0; i < 25; i++) {
      const traceTime = new Date(now.getTime() - i * 60000); // 每分钟一个trace
      traces.push({
        id: `trace-demo-${i + 1}`,
        name: traceNames[i % traceNames.length],
        timestamp: traceTime.toISOString(),
        userId: `user-${(i % 3) + 1}`,
        sessionId: `session-${Math.floor(i / 5) + 1}`,
        tags: i % 2 === 0 ? ["production", "api"] : ["development", "test"],
        observations: [
          {
            id: `obs-demo-${i}-1`,
            type: "GENERATION",
            name: "OpenAI GPT-4 Call",
            startTime: traceTime.toISOString(),
            endTime: new Date(traceTime.getTime() + 2000).toISOString(),
            model: "gpt-4",
            input: `User query ${i + 1}: What is machine learning?`,
            output: `Machine learning is a subset of artificial intelligence that enables computers to learn and improve from experience without being explicitly programmed.`,
            promptTokens: 12,
            completionTokens: 25,
            totalTokens: 37,
            calculatedTotalCost: 0.0025,
          },
          {
            id: `obs-demo-${i}-2`,
            type: "SPAN",
            name: "Vector Search",
            startTime: new Date(traceTime.getTime() + 100).toISOString(),
            endTime: new Date(traceTime.getTime() + 300).toISOString(),
            metadata: { collection: "documents", results: 5 },
          },
        ],
        scores:
          i % 4 === 0
            ? [
                {
                  id: `score-demo-${i}-1`,
                  name: "relevance",
                  value: 0.92,
                  dataType: "NUMERIC",
                  source: "EVAL",
                  timestamp: traceTime.toISOString(),
                },
                {
                  id: `score-demo-${i}-2`,
                  name: "accuracy",
                  value: 0.87,
                  dataType: "NUMERIC",
                  source: "EVAL",
                  timestamp: traceTime.toISOString(),
                },
              ]
            : [],
      });
    }

    return { traces };
  }

  init() {
    this.bindEvents();
    this.checkBackendHealth();
    this.loadTraces();
  }

  bindEvents() {
    // 刷新按钮
    document.getElementById("refreshBtn").addEventListener("click", () => {
      this.loadTraces();
    });

    // 过滤器应用
    document.getElementById("applyFiltersBtn").addEventListener("click", () => {
      this.applyFilters();
    });

    // 清除过滤器
    document.getElementById("clearFiltersBtn").addEventListener("click", () => {
      this.clearFilters();
    });

    // 实时过滤 (演示模式)
    if (DEMO_MODE) {
      const inputs = ["searchInput", "traceNameFilter", "userFilter"];
      inputs.forEach((id) => {
        document.getElementById(id).addEventListener("input", () => {
          clearTimeout(this.filterTimeout);
          this.filterTimeout = setTimeout(() => {
            this.applyFilters();
          }, 300); // 300ms 防抖
        });
      });
    }

    // 分页按钮
    document.getElementById("prevBtn").addEventListener("click", () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.loadTraces();
      }
    });

    document.getElementById("nextBtn").addEventListener("click", () => {
      this.currentPage++;
      this.loadTraces();
    });

    // 模态框关闭
    document.getElementById("closeMetricsBtn").addEventListener("click", () => {
      document.getElementById("metricsModal").style.display = "none";
    });

    // ESC 键关闭模态框
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        document.getElementById("metricsModal").style.display = "none";
      }
    });
  }

  async checkBackendHealth() {
    try {
      const response = await fetch(`${this.backendUrl}/api/health`);
      const data = await response.json();

      const statusDot = document.getElementById("statusDot");
      const statusText = document.getElementById("statusText");

      if (response.ok) {
        statusDot.className = "status-dot connected";
        statusText.textContent = DEMO_MODE
          ? "演示模式 (API连接正常)"
          : "已连接";
      } else {
        // API响应错误，启用演示模式
        if (!DEMO_MODE) {
          console.warn("API连接失败，启用演示模式");
          DEMO_MODE = true;
          this.demoData = this.generateDemoData();
        }
        statusDot.className = "status-dot error";
        statusText.textContent = "演示模式 (API连接失败)";
      }
    } catch (error) {
      console.error("Health check failed:", error);
      // 网络连接失败，启用演示模式
      if (!DEMO_MODE) {
        console.warn("网络连接失败，启用演示模式");
        DEMO_MODE = true;
        this.demoData = this.generateDemoData();
      }
      document.getElementById("statusDot").className = "status-dot error";
      document.getElementById("statusText").textContent =
        "演示模式 (网络连接失败)";
    }
  }

  async loadTraces() {
    this.showLoading();

    try {
      if (DEMO_MODE && this.demoData) {
        // 使用演示数据，支持客户端过滤
        setTimeout(() => {
          let filteredTraces = [...this.demoData.traces];

          // 应用客户端过滤
          if (this.filters.searchQuery) {
            const query = this.filters.searchQuery.toLowerCase();
            filteredTraces = filteredTraces.filter(
              (trace) =>
                trace.name?.toLowerCase().includes(query) ||
                trace.id.toLowerCase().includes(query),
            );
          }

          if (this.filters.name) {
            const nameFilter = this.filters.name.toLowerCase();
            filteredTraces = filteredTraces.filter((trace) =>
              trace.name?.toLowerCase().includes(nameFilter),
            );
          }

          if (this.filters.userId) {
            filteredTraces = filteredTraces.filter(
              (trace) => trace.userId === this.filters.userId,
            );
          }

          // 时间过滤
          if (this.filters.fromTimestamp || this.filters.toTimestamp) {
            filteredTraces = filteredTraces.filter((trace) => {
              const traceTime = new Date(trace.timestamp);
              const fromTime = this.filters.fromTimestamp
                ? new Date(this.filters.fromTimestamp)
                : null;
              const toTime = this.filters.toTimestamp
                ? new Date(this.filters.toTimestamp)
                : null;

              if (fromTime && traceTime < fromTime) return false;
              if (toTime && traceTime > toTime) return false;
              return true;
            });
          }

          // 分页
          const startIndex = (this.currentPage - 1) * this.pageSize;
          const endIndex = startIndex + this.pageSize;
          const pageTraces = filteredTraces.slice(startIndex, endIndex);

          this.renderTraces(pageTraces);
          this.updatePagination({
            page: this.currentPage,
            totalPages: Math.ceil(filteredTraces.length / this.pageSize),
            totalCount: filteredTraces.length,
          });
          this.hideLoading();
        }, 300); // 模拟网络延迟
        return;
      }

      const params = new URLSearchParams({
        page: this.currentPage,
        limit: this.pageSize,
        ...this.filters,
      });

      const response = await fetch(`${this.backendUrl}/api/traces?${params}`);
      const data = await response.json();

      if (response.ok) {
        this.renderTraces(data.traces || []);
        this.updatePagination(data.pagination);
      } else {
        // API调用失败，启用演示模式
        console.warn("API调用失败，启用演示模式:", data.message);
        DEMO_MODE = true;
        this.demoData = this.generateDemoData();
        this.loadTraces(); // 重新调用，使用演示模式
        return;
      }
    } catch (error) {
      console.error("Error loading traces:", error);
      // 网络错误也启用演示模式
      if (!DEMO_MODE) {
        console.warn("网络错误，启用演示模式");
        DEMO_MODE = true;
        this.demoData = this.generateDemoData();
        this.loadTraces(); // 重新调用，使用演示模式
        return;
      }
      this.showError("加载 trace 数据失败，已启用演示模式显示示例数据");
    } finally {
      this.hideLoading();
    }
  }

  async loadTraceDetail(traceId) {
    try {
      if (DEMO_MODE && this.demoData) {
        // 使用演示数据
        const trace = this.demoData.traces.find((t) => t.id === traceId);
        if (trace) {
          setTimeout(() => {
            this.renderTraceDetail({
              trace: trace,
              observations: trace.observations || [],
              scores: trace.scores || [],
            });
          }, 200); // 模拟网络延迟
          return;
        } else {
          throw new Error("演示数据中未找到该trace");
        }
      }

      const response = await fetch(`${this.backendUrl}/api/traces/${traceId}`);
      const data = await response.json();

      if (response.ok) {
        this.renderTraceDetail(data);
      } else {
        throw new Error(data.message || "Failed to load trace detail");
      }
    } catch (error) {
      console.error("Error loading trace detail:", error);
      this.showError("加载 trace 详情失败: " + error.message);
    }
  }

  applyFilters() {
    const searchQuery = document.getElementById("searchInput").value.trim();
    const traceName = document.getElementById("traceNameFilter").value.trim();
    const userId = document.getElementById("userFilter").value.trim();
    const dateFrom = document.getElementById("dateFrom").value;
    const dateTo = document.getElementById("dateTo").value;

    this.filters = {};

    if (searchQuery) {
      this.filters.searchQuery = searchQuery;
    }

    if (traceName) {
      this.filters.name = traceName;
    }

    if (userId) {
      this.filters.userId = userId;
    }

    if (dateFrom) {
      this.filters.fromTimestamp = new Date(dateFrom).toISOString();
    }

    if (dateTo) {
      this.filters.toTimestamp = new Date(dateTo).toISOString();
    }

    this.currentPage = 1;
    this.loadTraces();
  }

  clearFilters() {
    // 清除所有输入框
    document.getElementById("searchInput").value = "";
    document.getElementById("traceNameFilter").value = "";
    document.getElementById("userFilter").value = "";
    document.getElementById("dateFrom").value = "";
    document.getElementById("dateTo").value = "";

    // 清除过滤器对象
    this.filters = {};
    this.currentPage = 1;

    // 重新加载数据
    this.loadTraces();
  }

  renderTraces(traces) {
    const container = document.getElementById("tracesList");

    if (traces.length === 0) {
      container.innerHTML = '<div class="no-traces">暂无 trace 数据</div>';
      return;
    }

    container.innerHTML = traces
      .map((trace) => this.createTraceItemHTML(trace))
      .join("");
  }

  createTraceItemHTML(trace) {
    const timestamp = new Date(trace.timestamp).toLocaleString("zh-CN");
    const duration = trace.observations
      ? this.calculateTraceDuration(trace.observations)
      : "N/A";
    const observationCount = trace.observations ? trace.observations.length : 0;
    const errorCount = trace.observations
      ? trace.observations.filter((obs) => obs.level === "ERROR").length
      : 0;

    return `
            <div class="trace-item ${this.selectedTraceId === trace.id ? "selected" : ""}"
                 onclick="app.selectTrace('${trace.id}')">
                <div class="trace-item-header">
                    <div class="trace-name">${trace.name || trace.id}</div>
                    <div class="trace-timestamp">${timestamp}</div>
                </div>
                <div class="trace-meta">
                    <div class="trace-meta-item">
                        <span>ID:</span>
                        <span>${trace.id.slice(0, 8)}...</span>
                    </div>
                    <div class="trace-meta-item">
                        <span>持续时间:</span>
                        <span>${duration}</span>
                    </div>
                    <div class="trace-meta-item">
                        <span>观察数:</span>
                        <span>${observationCount}</span>
                    </div>
                    ${
                      errorCount > 0
                        ? `
                    <div class="trace-meta-item">
                        <span>错误:</span>
                        <span style="color: #dc3545;">${errorCount}</span>
                    </div>
                    `
                        : ""
                    }
                </div>
                ${
                  trace.tags && trace.tags.length > 0
                    ? `
                <div class="trace-tags">
                    ${trace.tags.map((tag) => `<span class="tag">${tag}</span>`).join("")}
                </div>
                `
                    : ""
                }
            </div>
        `;
  }

  calculateTraceDuration(observations) {
    if (!observations || observations.length === 0) return "N/A";

    const startTime = Math.min(
      ...observations.map((obs) => new Date(obs.startTime)),
    );
    const endTime = Math.max(
      ...observations.map((obs) => {
        const end = obs.endTime
          ? new Date(obs.endTime)
          : new Date(obs.startTime);
        return end;
      }),
    );

    const duration = endTime - startTime;
    return this.formatDuration(duration);
  }

  formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(2)}m`;
    return `${(ms / 3600000).toFixed(2)}h`;
  }

  selectTrace(traceId) {
    this.selectedTraceId = traceId;
    this.loadTraceDetail(traceId);

    // 更新选中状态
    document.querySelectorAll(".trace-item").forEach((item) => {
      item.classList.remove("selected");
    });
    document
      .querySelector(`[onclick="app.selectTrace('${traceId}')"]`)
      .classList.add("selected");
  }

  renderTraceDetail(data) {
    const container = document.getElementById("traceDetail");
    const trace = data.trace;

    if (!trace) {
      container.innerHTML = '<div class="no-selection">未找到 trace 数据</div>';
      return;
    }

    const observations = data.observations || [];
    const scores = data.scores || [];

    container.innerHTML = `
            <div class="trace-info">
                <div class="trace-info-grid">
                    <div class="info-item">
                        <div class="info-label">Trace ID</div>
                        <div class="info-value">${trace.id}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">名称</div>
                        <div class="info-value">${trace.name || "N/A"}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">时间戳</div>
                        <div class="info-value">${new Date(trace.timestamp).toLocaleString("zh-CN")}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">用户 ID</div>
                        <div class="info-value">${trace.userId || "N/A"}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">会话 ID</div>
                        <div class="info-value">${trace.sessionId || "N/A"}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">版本</div>
                        <div class="info-value">${trace.version || "N/A"}</div>
                    </div>
                </div>

                ${
                  trace.input
                    ? `
                <div class="trace-input">
                    <div class="info-label">输入</div>
                    <div class="observation-data">${JSON.stringify(trace.input, null, 2)}</div>
                </div>
                `
                    : ""
                }

                ${
                  trace.output
                    ? `
                <div class="trace-output">
                    <div class="info-label">输出</div>
                    <div class="observation-data">${JSON.stringify(trace.output, null, 2)}</div>
                </div>
                `
                    : ""
                }
            </div>

            ${
              observations.length > 0
                ? `
            <div class="observations-section">
                <h3>观察 (${observations.length})</h3>
                ${observations.map((obs) => this.createObservationHTML(obs)).join("")}
            </div>
            `
                : ""
            }

            ${
              scores.length > 0
                ? `
            <div class="scores-section">
                <h3>评分 (${scores.length})</h3>
                ${scores.map((score) => this.createScoreHTML(score)).join("")}
            </div>
            `
                : ""
            }
        `;
  }

  createObservationHTML(observation) {
    const startTime = new Date(observation.startTime).toLocaleString("zh-CN");
    const endTime = observation.endTime
      ? new Date(observation.endTime).toLocaleString("zh-CN")
      : "进行中";
    const duration = observation.endTime
      ? this.formatDuration(
          new Date(observation.endTime) - new Date(observation.startTime),
        )
      : "N/A";

    return `
            <div class="observation-item">
                <div class="observation-header">
                    <div>
                        <strong>${observation.name || "Unnamed"}</strong>
                        <span class="observation-type">${observation.type}</span>
                    </div>
                    <div class="observation-meta">
                        <span>开始: ${startTime}</span>
                        <span>持续时间: ${duration}</span>
                        ${observation.model ? `<span>模型: ${observation.model}</span>` : ""}
                    </div>
                </div>

                <div class="observation-content">
                    ${
                      observation.input
                        ? `
                    <div class="observation-input">
                        <div class="observation-label">输入</div>
                        <div class="observation-data">${this.formatData(observation.input)}</div>
                    </div>
                    `
                        : ""
                    }

                    ${
                      observation.output
                        ? `
                    <div class="observation-output">
                        <div class="observation-label">输出</div>
                        <div class="observation-data">${this.formatData(observation.output)}</div>
                    </div>
                    `
                        : ""
                    }
                </div>
            </div>
        `;
  }

  createScoreHTML(score) {
    return `
            <div class="score-item">
                <div class="score-header">
                    <strong>${score.name}</strong>
                    <span class="score-value">${score.value || score.stringValue || "N/A"}</span>
                </div>
                <div class="score-meta">
                    <span>类型: ${score.dataType}</span>
                    <span>来源: ${score.source}</span>
                    <span>时间: ${new Date(score.timestamp).toLocaleString("zh-CN")}</span>
                </div>
            </div>
        `;
  }

  formatData(data) {
    if (typeof data === "string") return data;
    try {
      return JSON.stringify(data, null, 2);
    } catch (e) {
      return String(data);
    }
  }

  updatePagination(pagination) {
    const pageInfo = document.getElementById("pageInfo");
    const prevBtn = document.getElementById("prevBtn");
    const nextBtn = document.getElementById("nextBtn");

    if (pagination) {
      pageInfo.textContent = `第 ${pagination.page} 页，共 ${pagination.totalPages} 页`;
      prevBtn.disabled = pagination.page <= 1;
      nextBtn.disabled = pagination.page >= pagination.totalPages;
    } else {
      pageInfo.textContent = `第 ${this.currentPage} 页`;
      prevBtn.disabled = this.currentPage <= 1;
      nextBtn.disabled = false;
    }
  }

  showLoading() {
    document.getElementById("loadingSpinner").style.display = "flex";
  }

  hideLoading() {
    document.getElementById("loadingSpinner").style.display = "none";
  }

  showError(message) {
    // 简单的错误显示，可以扩展为 toast 通知
    alert(message);
  }
}

// 全局实例
const app = new LangFuseApp();
window.app = app;
