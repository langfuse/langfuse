# Langfuse Self-Host Setup

Single `docker compose` deployment — runs all services on one machine (local or EC2).

## Architecture

| Service        | Purpose                     | Port   |
|--------------- |---------------------------- |--------|
| **Web**        | Frontend + API              | `3000` |
| **Worker**     | Background job processor    | `3030` |
| **PostgreSQL** | Primary database            | `5432` |
| **ClickHouse** | Analytics database          | `8123` |
| **Redis**      | Cache + job queues          | `6379` |
| **MinIO**      | S3-compatible blob storage  | `9090` |
| **Nginx**      | Reverse proxy               | `80`   |

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose

---

## Quick Start (Local)

```sh
cp .env.example .env
docker compose up -d
# Access at http://localhost:3000
```

**Login**: `admin@langfuse.local` / `admin123`

---

## EC2 Deployment

### 1. Launch EC2 Instance

- **AMI**: Ubuntu 24.04
- **Instance type**: `t3.large` recommended (8 GB RAM)
- **Storage**: 30 GB+ gp3
- **Security group inbound rules**:

| Port | Protocol | Source    | Purpose        |
|------|----------|----------|----------------|
| 22   | TCP      | Your IP  | SSH            |
| 80   | TCP      | 0.0.0.0/0 | HTTP (Nginx) |
| 443  | TCP      | 0.0.0.0/0 | HTTPS (optional) |

### 2. SSH into EC2 and Install Docker

```sh
ssh -i your-key.pem ubuntu@<EC2_PUBLIC_IP>
```

```sh
# Install Docker
sudo apt update && sudo apt install -y docker.io docker-compose-v2 nginx
sudo systemctl enable docker nginx
sudo systemctl start docker nginx
sudo usermod -aG docker $USER

# Log out and back in for docker group
exit
ssh -i your-key.pem ubuntu@<EC2_PUBLIC_IP>
```

### 3. Setup Nginx Reverse Proxy

```sh
sudo cp /home/ubuntu/langfuse/nginx/langfuse.conf /etc/nginx/sites-available/langfuse
sudo ln -sf /etc/nginx/sites-available/langfuse /etc/nginx/sites-enabled/langfuse
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

This proxies port `80` to Langfuse on port `3000`, so users access via `http://<EC2_PUBLIC_IP>` (no port needed).

### 4. Configure Environment

```sh
cd ~/langfuse
cp .env.example .env
```

Edit `.env`:

```env
NEXTAUTH_URL=http://<EC2_PUBLIC_IP>
NEXTAUTH_SECRET=<generate: openssl rand -base64 32>
SALT=<generate: openssl rand -base64 32>
ENCRYPTION_KEY=<generate: openssl rand -hex 32>
POSTGRES_PASSWORD=<strong-password>
CLICKHOUSE_PASSWORD=<strong-password>
REDIS_AUTH=<strong-password>
MINIO_ROOT_PASSWORD=<strong-password>
LANGFUSE_INIT_USER_PASSWORD=<strong-password>
```

### 5. Start Langfuse

```sh
docker compose up -d
```

Access at `http://<EC2_PUBLIC_IP>`

---

## GitHub Actions Auto-Deploy

Push to `main` triggers automatic deployment to EC2 via rsync.

### Required GitHub Secrets

Set these in your repo **Settings > Secrets and variables > Actions**:

| Secret        | Value                                      |
|--------------- |------------------------------------------ |
| `EC2_HOST`    | EC2 public IP or domain                    |
| `EC2_USER`    | `ubuntu`                                   |
| `EC2_SSH_KEY` | Contents of your `.pem` private key file   |

### How it works

1. Pushes code to `main`
2. Workflow rsyncs files to EC2 (excludes `.git`, `node_modules`, `.env`)
3. Runs `docker compose pull && docker compose up -d` on EC2
4. Runs a health check against `/api/public/health`

### First-time setup

On EC2, create the deploy directory and `.env` before the first workflow run:

```sh
mkdir -p ~/langfuse
cd ~/langfuse
cp .env.example .env
# Edit .env with production values
```

After that, every push to `main` auto-deploys.

---

## HTTPS with Let's Encrypt (Optional)

```sh
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

Update `.env`:

```env
NEXTAUTH_URL=https://your-domain.com
```

Then restart:

```sh
docker compose restart langfuse-web langfuse-worker
```

---

## Common Commands

```sh
docker compose up -d              # Start all services
docker compose down               # Stop all services
docker compose down -v            # Stop + wipe all data
docker compose pull               # Pull latest images
docker compose restart            # Restart all services
docker compose logs -f langfuse-web       # Web logs
docker compose logs -f langfuse-worker    # Worker logs
docker compose ps                 # Service status
```

---

## Sending Traces (Python)

```sh
pip install langfuse
```

```python
from langfuse import Langfuse

langfuse = Langfuse(
    public_key="pk-lf-local",           # From .env or project settings
    secret_key="sk-lf-local",           # From .env or project settings
    host="http://<EC2_PUBLIC_IP>"        # Or http://localhost:3000 locally
)

trace = langfuse.trace(name="my-trace")
generation = trace.generation(
    name="chat-completion",
    model="gpt-4",
    input=[{"role": "user", "content": "Hello"}],
    output="Hi there!",
)
langfuse.flush()
```

### OpenAI Integration

```python
from langfuse.openai import openai

client = openai.OpenAI()
response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello"}],
)
```

### API Keys

1. Open Langfuse web UI
2. Create or select a project
3. **Settings** > **API Keys** > Create new key pair

---

## Troubleshooting

```sh
# Check all services
docker compose ps

# Check nginx
sudo nginx -t
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log

# Check what's using a port
ss -tlnp | grep -E '80|3000'

# Restart a single service
docker compose restart langfuse-web
```
