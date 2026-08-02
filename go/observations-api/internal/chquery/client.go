package chquery

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/url"
	"reflect"
	"strings"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
)

// OpenConn connects to ClickHouse. clickhouse:// URLs use the native
// protocol (preferred for performance); http(s):// URLs use the HTTP
// interface, matching the Node client's transport.
func OpenConn(rawURL, user, password, database string) (driver.Conn, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil, fmt.Errorf("invalid ClickHouse URL: %w", err)
	}

	protocol := clickhouse.Native
	secure := false
	port := u.Port()
	switch u.Scheme {
	case "clickhouse", "tcp":
		if port == "" {
			port = "9000"
		}
	case "https":
		protocol = clickhouse.HTTP
		secure = true
		if port == "" {
			port = "443"
		}
	case "http":
		protocol = clickhouse.HTTP
		if port == "" {
			port = "8123"
		}
	default:
		return nil, fmt.Errorf("unsupported ClickHouse URL scheme: %s", u.Scheme)
	}

	// URL userinfo wins over env credentials when present.
	if u.User != nil {
		if name := u.User.Username(); name != "" {
			user = name
		}
		if pw, ok := u.User.Password(); ok {
			password = pw
		}
	}

	opts := &clickhouse.Options{
		Addr:     []string{u.Hostname() + ":" + port},
		Protocol: protocol,
		Auth: clickhouse.Auth{
			Database: database,
			Username: user,
			Password: password,
		},
		DialTimeout: 10 * time.Second,
		ReadTimeout: 2 * time.Minute,
	}
	if secure {
		opts.TLS = &tls.Config{MinVersion: tls.VersionTLS12}
	}

	return clickhouse.Open(opts)
}

// Execute runs the query with server-side parameters and returns rows as
// alias-keyed maps of normalized Go values (pointers dereferenced, times in
// UTC truncated to milliseconds for JS Date parity).
func Execute(ctx context.Context, conn driver.Conn, q *Query, logTags map[string]string) ([]map[string]any, error) {
	params := clickhouse.Parameters{}
	for _, p := range q.Params {
		params[p.Name] = p.Value
	}

	tagJSON, _ := json.Marshal(logTags)
	ctx = clickhouse.Context(ctx,
		clickhouse.WithParameters(params),
		clickhouse.WithSettings(clickhouse.Settings{
			// Same observability channel the Node stack uses for query
			// attribution in system.query_log.
			"log_comment": string(tagJSON),
			// Node enables this for all EventsReadOnly-path queries; required
			// for the hasAllTokens FTS predicates.
			"enable_full_text_index": 1,
		}),
	)

	rows, err := conn.Query(ctx, q.SQL)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	columnTypes := rows.ColumnTypes()
	columnNames := rows.Columns()

	var result []map[string]any
	for rows.Next() {
		dests := make([]any, len(columnTypes))
		for i, ct := range columnTypes {
			dests[i] = reflect.New(ct.ScanType()).Interface()
		}
		if err := rows.Scan(dests...); err != nil {
			return nil, err
		}
		row := make(map[string]any, len(columnNames))
		for i, name := range columnNames {
			row[name] = normalizeCell(reflect.ValueOf(dests[i]).Elem().Interface())
		}
		result = append(result, row)
	}
	return result, rows.Err()
}

// normalizeCell dereferences Nullable pointers and truncates timestamps to
// millisecond precision (the Node stack round-trips ClickHouse DateTime64
// through JS Date, which holds milliseconds).
func normalizeCell(v any) any {
	switch t := v.(type) {
	case time.Time:
		return t.UTC().Truncate(time.Millisecond)
	case *time.Time:
		if t == nil {
			return nil
		}
		return t.UTC().Truncate(time.Millisecond)
	}

	rv := reflect.ValueOf(v)
	if rv.Kind() == reflect.Ptr {
		if rv.IsNil() {
			return nil
		}
		return normalizeCell(rv.Elem().Interface())
	}
	return v
}

// SanitizeSQLForLogs collapses whitespace for compact error logging.
func SanitizeSQLForLogs(sql string) string {
	return strings.Join(strings.Fields(sql), " ")
}
