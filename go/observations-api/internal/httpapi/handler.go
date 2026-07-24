package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/langfuse/langfuse/go/observations-api/internal/apierror"
	"github.com/langfuse/langfuse/go/observations-api/internal/auth"
	"github.com/langfuse/langfuse/go/observations-api/internal/chquery"
	"github.com/langfuse/langfuse/go/observations-api/internal/config"
	"github.com/langfuse/langfuse/go/observations-api/internal/enrich"
	"github.com/langfuse/langfuse/go/observations-api/internal/query"
	"github.com/langfuse/langfuse/go/observations-api/internal/ratelimit"
	"github.com/langfuse/langfuse/go/observations-api/internal/wire"
)

type Handler struct {
	cfg       *config.Config
	auth      *auth.Service
	rateLimit *ratelimit.Service
	ch        driver.Conn
	pg        *pgxpool.Pool
	logger    *slog.Logger
}

func NewHandler(cfg *config.Config, authSvc *auth.Service, rl *ratelimit.Service, ch driver.Conn, pg *pgxpool.Pool, logger *slog.Logger) *Handler {
	return &Handler{cfg: cfg, auth: authSvc, rateLimit: rl, ch: ch, pg: pg, logger: logger}
}

// ServeObservationsV2 handles GET /api/public/v2/observations with the exact
// gate -> auth -> rate limit -> validate -> query -> respond order of
// createAuthedProjectAPIRoute + the route handler.
func (h *Handler) ServeObservationsV2(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteError(w, apierror.NewMethodNotAllowedError())
		return
	}

	ctx := r.Context()

	// Auth precedes the preview gate: the gate lives inside the route
	// handler fn, which only runs for authenticated requests.
	scope, err := h.auth.Verify(ctx, r.Header.Get("Authorization"))
	if err != nil {
		if err == auth.ErrDelegateUnavailable {
			writeJSON(w, 503, map[string]any{"message": "Service Unavailable"})
			return
		}
		if failure, ok := err.(*auth.AuthFailure); ok {
			writeJSON(w, failure.Status, map[string]any{"message": failure.Message})
			return
		}
		writeJSON(w, 401, map[string]any{"message": "Authentication failed"})
		return
	}

	if res := h.rateLimit.Check(ctx, scope); res != nil && res.Limited {
		writeRateLimited(w, res)
		return
	}

	params, err := query.Parse(query.ParseQueryString(r.URL.RawQuery))
	if err != nil {
		WriteError(w, err)
		return
	}

	// Preview gate (thrown inside the route fn in Node, after query parsing
	// would... actually before: the fn checks it first, so validation
	// errors surface only when the gate is open — but zod parses the query
	// before fn runs. Order here: parse first (400s win), then gate (404).
	if !h.cfg.V4PreviewOptIn {
		WriteError(w, apierror.NewNotFoundError(
			"The observations v2 API is only available in a Langfuse v4 write mode. Learn more at: https://langfuse.com/docs/v4"))
		return
	}

	q, err := chquery.Build(params, scope.ProjectID)
	if err != nil {
		WriteError(w, err)
		return
	}

	queryCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()

	rows, err := chquery.Execute(queryCtx, h.ch, q, map[string]string{
		"projectId": scope.ProjectID,
		"surface":   "publicapi",
		"route":     "/api/public/v2/observations",
		"service":   "observations-api-go",
	})
	if err != nil {
		h.logger.Error("clickhouse query failed", "error", err, "projectId", scope.ProjectID, "sql", chquery.SanitizeSQLForLogs(q.SQL))
		WriteError(w, err)
		return
	}

	// limit+1 fetch: detect more results, slice to limit.
	limit := int(params.Limit)
	hasMore := len(rows) > limit
	if hasMore {
		rows = rows[:limit]
	}

	// Model enrichment only when the "model" field group was requested.
	includeModel := false
	for _, g := range params.Fields {
		if g == "model" {
			includeModel = true
			break
		}
	}
	var models map[string]*enrich.ModelPrices
	if includeModel {
		ids := make([]string, 0)
		seen := map[string]bool{}
		for _, row := range rows {
			if id, ok := row["internal_model_id"].(string); ok && id != "" && !seen[id] {
				seen[id] = true
				ids = append(ids, id)
			}
		}
		models, err = enrich.FetchModels(ctx, h.pg, scope.ProjectID, ids)
		if err != nil {
			h.logger.Error("model enrichment query failed", "error", err, "projectId", scope.ProjectID)
			WriteError(w, err)
			return
		}
	}

	data := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		var model *enrich.ModelPrices
		if includeModel {
			if id, ok := row["internal_model_id"].(string); ok {
				model = models[id]
			}
		}
		data = append(data, wire.RowToAPIObservation(row, model))
	}

	meta := map[string]any{}
	if hasMore && len(rows) > 0 {
		last := rows[len(rows)-1]
		startTime, _ := last["start_time"].(time.Time)
		traceID, _ := last["trace_id"].(string)
		id, _ := last["id"].(string)
		meta["cursor"] = query.EncodeCursor(startTime, traceID, id)
	}

	writeJSON(w, 200, map[string]any{
		"data": data,
		"meta": meta,
	})
}

// writeRateLimited ports sendRateLimitResponse: headers + the unstable error
// contract body with code "rate_limited".
func writeRateLimited(w http.ResponseWriter, res *ratelimit.Result) {
	now := time.Now()
	w.Header().Set("Retry-After", strconv.FormatInt(res.RetryAfterSeconds(), 10))
	w.Header().Set("X-RateLimit-Limit", strconv.Itoa(res.Points))
	w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(res.RemainingPoints))
	w.Header().Set("X-RateLimit-Reset", res.ResetAt(now).Format("Mon Jan 02 2006 15:04:05 GMT-0700 (MST)"))

	writeJSON(w, 429, map[string]any{
		"message": "Rate limit exceeded",
		"code":    "rate_limited",
		"details": map[string]any{
			"retryAfterSeconds": res.RetryAfterSeconds(),
			"limit":             res.Points,
			"remaining":         res.RemainingPoints,
			"resetAt":           res.ResetAt(now).UTC().Format("2006-01-02T15:04:05.000Z"),
		},
	})
}
