export const infrastructureNames = [
  /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(?:\/|https?:\/\/)/i,
  /^HTTP\s+(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)(?:\s|$)/i,
  /^\/(?:ping|health|healthz|ready|readyz|livez|metrics)\/?(?:\?.*)?$/i,
  /^(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s+/i,
  /^(?:sql|http\.client|dns\.lookup|postgres\.query|redis\.command)$/i,
  /^(?:db|database|postgres|mysql|redis)\.(?:connect|connection|query|execute|transaction|commit|rollback)$/i,
  /^(?:put_with_retries|send_request|connect|execute|fetch|retry)$/i,
];
