// Command clickhouse-jwt-migrate applies the Langfuse ClickHouse migrations
// with a JWT instead of a user and password.
//
// The migrate CLI cannot send a ClickHouse access token. This command opens
// the connection itself, with clickhouse-go's JWT support, and hands it to the
// golang-migrate ClickHouse driver, so migrations run exactly as they do
// through the CLI. The migration scripts call it when CLICKHOUSE_AUTH_MODE is
// jwt.
//
// The connection and the token source are read from the same environment
// variables the Langfuse containers use.
package main

import (
	"bufio"
	"context"
	"crypto/tls"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/golang-migrate/migrate/v4"
	chmigrate "github.com/golang-migrate/migrate/v4/database/clickhouse"
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

const (
	// The migrate CLI has no read timeout and a migration can run for hours.
	// clickhouse-go cannot disable its read timeout, so this one never triggers.
	readTimeout = 100 * 365 * 24 * time.Hour

	// ClickHouse's native protocol port with TLS.
	defaultSecurePort = "9440"

	usage = `usage: clickhouse-jwt-migrate -source DIR [-table-engine ENGINE] [-cluster EXPRESSION] COMMAND

-cluster takes the ON CLUSTER expression percent-encoded, exactly as the
migrate CLI takes it in the x-cluster-name URL parameter.

commands:
  up         apply all up migrations
  down       apply all down migrations, after confirmation on stdin
  drop [-f]  drop everything inside the database; -f skips the confirmation`
)

type arguments struct {
	source      string
	tableEngine string
	cluster     string
	command     string
	force       bool
}

func main() {
	if err := run(os.Args[1:], os.Getenv, os.Stdin); err != nil {
		log.SetFlags(0)
		log.Fatalln("error:", err)
	}
}

func run(args []string, getenv func(string) string, stdin io.Reader) error {
	parsed, err := parseArguments(args)
	if err != nil {
		return err
	}
	options, err := connectionOptions(getenv, &http.Client{})
	if err != nil {
		return err
	}

	if !parsed.force {
		if question := confirmation(parsed.command); question != "" {
			log.Println(question, "[y/N]")
			answer, _ := bufio.NewReader(stdin).ReadString('\n')
			if strings.ToLower(strings.TrimSpace(answer)) != "y" {
				return errors.New("not confirmed, nothing was changed")
			}
		}
	}

	return apply(options, parsed)
}

// apply runs the command over the given connection.
func apply(options *clickhouse.Options, parsed arguments) error {
	driver, err := chmigrate.WithInstance(clickhouse.OpenDB(options), &chmigrate.Config{
		DatabaseName:          options.Auth.Database,
		ClusterName:           parsed.cluster,
		MigrationsTableEngine: parsed.tableEngine,
		MultiStatementEnabled: true,
	})
	if err != nil {
		return fmt.Errorf("connecting to ClickHouse: %w", err)
	}
	migrator, err := migrate.NewWithDatabaseInstance("file://"+parsed.source, "clickhouse", driver)
	if err != nil {
		return err
	}
	migrator.Log = migrationLog{}
	defer migrator.Close()

	switch parsed.command {
	case "up":
		err = migrator.Up()
	case "down":
		err = migrator.Down()
	case "drop":
		err = migrator.Drop()
	}
	if errors.Is(err, migrate.ErrNoChange) {
		log.Println("no change")
		return nil
	}
	return err
}

func parseArguments(args []string) (arguments, error) {
	var parsed arguments
	flags := flag.NewFlagSet("clickhouse-jwt-migrate", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	flags.StringVar(&parsed.source, "source", "", "")
	flags.StringVar(&parsed.tableEngine, "table-engine", "", "")
	flags.StringVar(&parsed.cluster, "cluster", "", "")
	if err := flags.Parse(args); err != nil {
		return parsed, fmt.Errorf("%w\n%s", err, usage)
	}

	// The migration driver puts the expression into its SQL as given.
	cluster, err := url.QueryUnescape(parsed.cluster)
	if err != nil {
		return parsed, fmt.Errorf("-cluster is not percent-encoded: %w", err)
	}
	parsed.cluster = cluster

	rest := flags.Args()
	if len(rest) == 0 || parsed.source == "" {
		return parsed, errors.New(usage)
	}
	parsed.command = rest[0]
	switch {
	case parsed.command == "drop" && len(rest) == 2 && rest[1] == "-f":
		parsed.force = true
	case len(rest) > 1:
		return parsed, errors.New(usage)
	}
	switch parsed.command {
	case "up", "down", "drop":
		return parsed, nil
	}
	return parsed, errors.New(usage)
}

// confirmation is the question to ask before a destructive command, as the
// migrate CLI does.
func confirmation(command string) string {
	switch command {
	case "down":
		return "Are you sure you want to apply all down migrations?"
	case "drop":
		return "Are you sure you want to drop the entire database schema?"
	}
	return ""
}

// connectionOptions builds the ClickHouse connection from the environment.
// TLS is required and the server certificate is verified, because the
// connection carries a bearer token.
func connectionOptions(getenv func(string) string, httpClient *http.Client) (*clickhouse.Options, error) {
	raw := getenv("CLICKHOUSE_MIGRATION_URL")
	if raw == "" {
		return nil, errors.New("CLICKHOUSE_MIGRATION_URL is not configured")
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "clickhouse" || parsed.Hostname() == "" {
		return nil, errors.New("CLICKHOUSE_MIGRATION_URL must look like clickhouse://host:9440")
	}
	if parsed.User != nil {
		return nil, errors.New("CLICKHOUSE_MIGRATION_URL must not contain credentials when CLICKHOUSE_AUTH_MODE is jwt")
	}
	if getenv("CLICKHOUSE_MIGRATION_SSL") != "true" {
		return nil, errors.New("CLICKHOUSE_AUTH_MODE jwt sends a bearer token and requires CLICKHOUSE_MIGRATION_SSL=true")
	}
	port := parsed.Port()
	if port == "" {
		port = defaultSecurePort
	}
	database := getenv("CLICKHOUSE_DB")
	if database == "" {
		database = "default"
	}
	token, err := newTokenSource(getenv, httpClient)
	if err != nil {
		return nil, err
	}

	return &clickhouse.Options{
		Addr:        []string{net.JoinHostPort(parsed.Hostname(), port)},
		Auth:        clickhouse.Auth{Database: database},
		TLS:         &tls.Config{MinVersion: tls.VersionTLS12},
		ReadTimeout: readTimeout,
		// Called for every new connection, so a renewed token is picked up
		// during a long migration.
		GetJWT: func(ctx context.Context) (string, error) { return token(ctx) },
	}, nil
}

// migrationLog prints one line per applied migration, like the migrate CLI.
type migrationLog struct{}

func (migrationLog) Printf(format string, v ...any) { log.Printf(format, v...) }
func (migrationLog) Verbose() bool                  { return false }
