// Package enrich adds Postgres model-pricing data to observations when the
// "model" field group is requested, porting enrichObservationsWithModelData
// (packages/shared/src/server/repositories/events.ts).
package enrich

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"
)

// ModelPrices carries the enrichment values for one matched model.
type ModelPrices struct {
	ID          string
	InputPrice  *decimal.Decimal
	OutputPrice *decimal.Decimal
	TotalPrice  *decimal.Decimal
}

// FetchModels resolves internal model IDs against Postgres models/prices,
// scoped to the project or global (project_id IS NULL) models.
func FetchModels(ctx context.Context, pool *pgxpool.Pool, projectID string, modelIDs []string) (map[string]*ModelPrices, error) {
	result := make(map[string]*ModelPrices)
	if len(modelIDs) == 0 {
		return result, nil
	}

	rows, err := pool.Query(ctx, `
		SELECT m.id, p.usage_type, p.price::text
		FROM models m
		LEFT JOIN prices p ON p.model_id = m.id
		WHERE m.id = ANY($1)
		  AND (m.project_id = $2 OR m.project_id IS NULL)
		ORDER BY m.id, p.id
	`, modelIDs, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var id string
		var usageType, priceText *string
		if err := rows.Scan(&id, &usageType, &priceText); err != nil {
			return nil, err
		}
		m, ok := result[id]
		if !ok {
			m = &ModelPrices{ID: id}
			result[id] = m
		}
		if usageType == nil || priceText == nil {
			continue
		}
		price, err := decimal.NewFromString(*priceText)
		if err != nil {
			continue
		}
		// Price.find(...) semantics: first row per usage type wins.
		switch *usageType {
		case "input":
			if m.InputPrice == nil {
				m.InputPrice = &price
			}
		case "output":
			if m.OutputPrice == nil {
				m.OutputPrice = &price
			}
		case "total":
			if m.TotalPrice == nil {
				m.TotalPrice = &price
			}
		}
	}
	return result, rows.Err()
}
