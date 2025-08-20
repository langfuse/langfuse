# Prometheus Metrics for Langfuse

## Quick Start

### 1. Environment Configuration

Create or update your `.env` file:

```bash
PROMETHEUS_METRICS_ENABLED=true # Enable Prometheus metrics
PROMETHEUS_METRICS_PORT=3000 # Optional: defaults to main application port
```

### 2. Start Langfuse and Test the Endpoint

Start your Langfuse instance and test the metrics endpoint:

```bash
curl http://localhost:3000/api/metrics
```

You should see system metrics output like:

```
# HELP langfuse_active_projects Number of active projects
# TYPE langfuse_active_projects gauge
langfuse_active_projects 42

# HELP langfuse_active_users Number of active users
# TYPE langfuse_active_users gauge
langfuse_active_users 128

# HELP langfuse_process_cpu_user_seconds_total Total user CPU time spent in seconds.
# TYPE langfuse_process_cpu_user_seconds_total counter
langfuse_process_cpu_user_seconds_total 12.34
```

### 3. Prometheus Scrape Configuration

Add to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: "langfuse"
    static_configs:
      - targets: ["localhost:3000"] # Adjust host:port as needed
    metrics_path: "/api/metrics"
    scrape_interval: 30s
    scrape_timeout: 10s
```

### 4. Docker Compose Example

```yaml
version: "3.8"
services:
  langfuse:
    image: langfuse/langfuse:latest
    environment:
      - PROMETHEUS_METRICS_ENABLED=true
    ports:
      - "3000:3000"

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
```

---

## Endpoints

Once enabled, metrics are available at:

- **Web Service**: `GET /api/metrics`
- **Content-Type**: `text/plain; charset=utf-8`
- **Format**: Prometheus exposition format

## Available Metrics

**Note**: Business metrics (traces, observations, scores, tokens, costs) are available via the existing `/api/public/metrics` endpoint which provides rich ClickHouse-powered analytics. This Prometheus endpoint focuses on system operational metrics.

### System Metrics

| Metric Name                     | Type  | Labels | Description                           |
| ------------------------------- | ----- | ------ | ------------------------------------- |
| `langfuse_active_projects`      | Gauge | -      | Number of active projects             |
| `langfuse_active_users`         | Gauge | -      | Number of active users (last 30 days) |
| `langfuse_ingestion_queue_size` | Gauge | -      | Current size of ingestion queue       |

### Default System Metrics

The following Node.js system metrics are also exposed with `langfuse_` prefix:

- CPU usage
- Memory usage
- Heap usage
- Event loop lag
- Process uptime
- GC metrics

## Key Metrics to Monitor

- **`langfuse_active_projects`** - Track system usage
- **`langfuse_active_users`** - Monitor user activity
- **`langfuse_ingestion_queue_size`** - Queue health monitoring
- **`langfuse_process_*`** - Node.js system performance
- **`langfuse_nodejs_*`** - Runtime metrics

## Grafana Dashboard

Example Grafana dashboard queries:

### Active Projects

```promql
langfuse_active_projects
```

### Queue Health

```promql
langfuse_ingestion_queue_size
```

### Memory Usage

```promql
langfuse_process_resident_memory_bytes
```

### CPU Usage

```promql
rate(langfuse_process_cpu_user_seconds_total[5m])
```

### Event Loop Lag

```promql
langfuse_nodejs_eventloop_lag_seconds
```

## Integration with Observability Platforms

### Datadog

Configure Datadog Agent to scrape Prometheus metrics:

```yaml
# datadog.yaml
openmetrics_check:
  instances:
    - prometheus_url: http://localhost:3000/api/metrics
      namespace: langfuse
      metrics:
        - langfuse_*
```

### New Relic

Use New Relic's Prometheus integration:

```yaml
# newrelic-prometheus.yml
integrations:
  - name: nri-prometheus
    config:
      standalone: false
      urls:
        - http://localhost:3000/api/metrics
      cluster_name: langfuse
```

### IBM Instana

Configure Instana to monitor Prometheus endpoints:

```yaml
# instana-agent.yaml
com.instana.plugin.prometheus:
  enabled: true
  scrapeConfigs:
    - jobName: langfuse
      targets: ["localhost:3000"]
      metricsPath: /api/metrics
```

## Security Considerations

1. **Network Access**: The metrics endpoint is publicly accessible when enabled. Consider using:
   - Network-level restrictions (firewall rules)
   - Reverse proxy authentication
   - VPN access

2. **Sensitive Data**: Metrics include project IDs and model names. Ensure compliance with your data governance policies.

3. **Rate Limiting**: Consider implementing rate limiting on the metrics endpoint to prevent abuse.

## Performance Impact

- **Memory Usage**: Each unique label combination creates a new time series. High cardinality labels (like user IDs) should be avoided.
- **CPU Impact**: Metrics collection has minimal CPU overhead (~1-2%).
- **Network**: Each scrape request generates ~50-200KB of metrics data depending on usage.

## Troubleshooting

### Metrics not appearing

1. Check that `PROMETHEUS_METRICS_ENABLED=true` is set
2. Verify the endpoint is accessible: `curl http://localhost:3000/api/metrics`
3. Check application logs for initialization errors

### High memory usage

1. Review label cardinality - avoid high-cardinality labels
2. Consider shorter metric retention periods
3. Monitor the number of active time series

### Missing system metrics

1. Ensure Prometheus metrics are enabled with `PROMETHEUS_METRICS_ENABLED=true`
2. Check that the metrics endpoint is accessible
3. Verify system metric collection is working

## Development

The metrics system is built on the `prom-client` library and follows these patterns:

- **Singleton Pattern**: Single metrics instance per process
- **System Focus**: Exposes Node.js performance and Langfuse system health metrics
- **Separation of Concerns**: Business metrics handled by `/api/public/metrics`, system metrics by `/api/metrics`
- **Error Handling**: Comprehensive error handling with logging

For adding new system metrics, see `packages/shared/src/server/prometheus-metrics.ts`.

## Future Roadmap

Future improvements to consider (not part of this initial implementation):

1. **Advanced Metrics**
   - Custom metrics per project
   - Detailed latency breakdowns per operation
   - Queue-specific metrics

2. **Security Enhancements**
   - Authentication for metrics endpoint
   - Fine-grained access control
   - Metrics data anonymization options

3. **Integration Features**
   - Pre-built Grafana dashboards
   - Alert rule templates
   - More observability platform integrations

4. **Performance Optimizations**
   - Metric caching
   - Cardinality limits
   - Custom retention policies