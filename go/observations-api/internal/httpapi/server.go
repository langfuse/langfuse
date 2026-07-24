package httpapi

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/langfuse/langfuse/go/observations-api/internal/apierror"
)

// NewMux wires the routes. The service intentionally serves only the v2
// observations list route plus health probes; everything else is 404 in the
// standard error contract.
func NewMux(h *Handler, logger *slog.Logger) *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/public/v2/observations", func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		h.ServeObservationsV2(w, r)
		logger.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"durationMs", time.Since(start).Milliseconds(),
		)
	})

	health := func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, 200, map[string]any{"status": "OK"})
	}
	mux.HandleFunc("/api/public/health", health)
	mux.HandleFunc("/health", health)

	mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		WriteError(w, apierror.NewNotFoundError("Not found"))
	})

	return mux
}
