# STEP 0: increase your docker desktop resource with at least 12G memory

# INIT CONFIG

## env

copy env in the current folder to the repo root with name .env

## devcontainer

copy devcontainer folder in the current folder to the repo root with name .devcontainer

# dependences

## DATABASE: use revia postgres, with a new database lf

with command line psql, you can connect to the server by:

```bash
psql -h localhost -U postgres
```

while prompt to input password, use **postgres**

After you connect to the postgres server, use the following command to create the needed database

```sql
CREATE DATABASE lf;
```

## REDIS: use revia redis stack

## Clickhouse and Minio: use docker-compose.dev.yml in current folder

```
docker compose -f ./docker-compose.dev.yml up -d --wait
```

# START DEV

use vscode to start current foler, use the tips on the right footer to reopen it in container

some command for dev:

```bash
# install
pnpm install

# init/migrate database schema
pnpm db:migrate

# start web dev
# it is very important to set a large enough memory for nextjs dev, otherwith OOM or just exit without any warning
NODE_OPTIONS="--max-old-space-size=8192" pnpm dev:web
```
