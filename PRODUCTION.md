# Production deployment with docker-compose + Cloudflare Tunnel

This document describes deploying `docker-compose.yml` on a single host and
exposing it publicly through a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
(`cloudflared`) instead of opening inbound ports on the host firewall.

## Topology

- `cloudflared` runs as a process on the host (or on a separate machine with
  network access to this host) — it is **not** a service in
  `docker-compose.yml`.
- `cloudflared` connects outbound to Cloudflare's edge and forwards incoming
  requests to `http://127.0.0.1:3000`, where `langfuse-web` is published.
- Every service in `docker-compose.yml`, including `langfuse-web` and
  `minio`, is bound to `127.0.0.1`. Nothing in the stack is reachable from
  outside the host; the tunnel is the only ingress path.
- MinIO's media-download port is deliberately not exposed through the
  tunnel. Presigned media URLs (`LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT`) will not
  be reachable by end-user browsers in this setup. If you start relying on
  media/file uploads in Langfuse, you will need a second tunnel hostname
  routed to `127.0.0.1:9090` and matching `LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT`
  / `LANGFUSE_S3_MEDIA_UPLOAD_EXTERNAL_ENDPOINT` values — out of scope here.

## 1. Generate production secrets

```bash
scripts/generate-prod-secrets.sh --domain https://langfuse.example.com
```

This writes a `.env` file (mode `600`, already covered by `.gitignore` —
double check it is never committed) with strong random values for every
`# CHANGEME` in `docker-compose.yml`: Postgres, ClickHouse, Redis, MinIO,
`NEXTAUTH_SECRET`, `SALT`, and `ENCRYPTION_KEY`. Re-running the script is
safe — it preserves values already present and only fills in what's
missing; use `--force` to rotate everything at once.

`https://langfuse.example.com` must be the public hostname you will route
through the Cloudflare Tunnel in step 3.

## 2. Start the stack

```bash
docker compose --env-file .env up -d
docker compose ps
```

Confirm `langfuse-web` is healthy and reachable locally before wiring up
the tunnel:

```bash
curl -sf http://127.0.0.1:3000/api/public/health
```

## 3. Install and configure cloudflared

On the host (or another machine that can reach `127.0.0.1:3000` on this
host over your network):

```bash
# Debian/Ubuntu example — see Cloudflare's docs for other platforms
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloudflare-main.gpg
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update && sudo apt-get install cloudflared

cloudflared tunnel login
cloudflared tunnel create langfuse
```

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: langfuse
credentials-file: /root/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: langfuse.example.com
    service: http://127.0.0.1:3000
  - service: http_status:404
```

Route DNS and run it as a service:

```bash
cloudflared tunnel route dns langfuse langfuse.example.com
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

Verify from outside the network:

```bash
curl -sf https://langfuse.example.com/api/public/health
```

## 4. Harden the host as defense in depth

`docker-compose.yml` binds every port to `127.0.0.1`, so nothing is
reachable externally even without a firewall. Still, as defense in depth:

- Keep the host firewall default-deny on inbound traffic; `cloudflared`
  only needs outbound access.
- Do not add `-p 0.0.0.0:...` overrides to any service.
- If you administer MinIO or Postgres remotely, use SSH port forwarding
  (`ssh -L 5432:127.0.0.1:5432 host`) rather than publishing their ports.

## 5. Operational checklist

- **Backups**: back up the named volumes (`langfuse_postgres_data`,
  `langfuse_clickhouse_data`, `langfuse_minio_data`) off-host on a schedule.
- **Updates**: pull new image tags (`docker.io/langfuse/langfuse:3`,
  `langfuse-worker:3`) and re-run `docker compose --env-file .env up -d`;
  the worker container runs pending migrations on startup.
- **Secrets rotation**: delete the specific key from `.env` and re-run
  `scripts/generate-prod-secrets.sh --domain ...` to rotate a single
  secret, or `--force` to rotate everything (this invalidates existing
  sessions and API keys derived from `SALT`/`ENCRYPTION_KEY`).
- **Email**: set `EMAIL_FROM_ADDRESS` / `SMTP_CONNECTION_URL` in `.env` if
  you rely on transactional email (invites, password reset).
