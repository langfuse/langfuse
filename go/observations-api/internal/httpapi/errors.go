// Error rendering for the public-api error contract, mirroring
// web/src/features/public-api/server/withMiddlewares.ts and
// createAuthedProjectAPIRoute.ts:
//   - BaseError:      {"message": <msg>, "error": <error name>}
//   - Auth errors:    {"message": <msg>}                       (no "error" key)
//   - Zod 400:        {"message": "Invalid request data", "error": [issues]}
//   - Rate limit 429: {"message": ..., "code": "rate_limited", "details": {...}}
package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/langfuse/langfuse/go/observations-api/internal/apierror"
)

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// WriteError converts an error into the public-api error contract.
func WriteError(w http.ResponseWriter, err error) {
	switch e := err.(type) {
	case *apierror.ValidationError:
		writeJSON(w, 400, map[string]any{
			"message": "Invalid request data",
			"error":   e.Issues,
		})
	case *apierror.APIError:
		writeJSON(w, e.Status, map[string]any{
			"message": e.Message,
			"error":   e.Name,
		})
	default:
		writeJSON(w, 500, map[string]any{
			"message": "Internal Server Error",
			"error":   err.Error(),
		})
	}
}
