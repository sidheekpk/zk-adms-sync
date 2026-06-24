# ZK Connect — production deploy

Two Docker images (`zkc-web`, `zkc-adms`) behind Caddy on a single VPS.
Postgres + Redis live on the existing shared cluster.

## Prerequisites

1. VPS with Docker + Docker Compose v2.
2. DNS records for both subdomains pointing at the VPS:
   - `app.zkconnect.example.com` → admin UI
   - `adms.zkconnect.example.com` → device endpoint
3. Port 80 + 443 open inbound to the VPS for Caddy/ACME.

## First deploy

```bash
# 1. Clone the repo on the VPS
git clone <repo> /opt/zk-sync
cd /opt/zk-sync

# 2. Build the production .env (NEVER commit this)
cp .env .env.prod
# … edit .env.prod and set:
#    DATABASE_URL=postgres://…
#    REDIS_URL=redis://…
#    BETTER_AUTH_SECRET=<openssl rand -base64 48>
#    ENCRYPTION_KEY=<openssl rand -base64 48>
#    BETTER_AUTH_URL=https://app.zkconnect.example.com
#    NEXT_PUBLIC_APP_URL=https://app.zkconnect.example.com
#    NEXT_PUBLIC_ADMS_HOST=adms.zkconnect.example.com
#    NEXT_PUBLIC_ADMS_PORT=443
#    APP_DOMAIN=app.zkconnect.example.com
#    ADMS_DOMAIN=adms.zkconnect.example.com
#    ACME_EMAIL=ops@yourcompany.com
#    BOOTSTRAP_SUPER_ADMIN_EMAIL=…
#    BOOTSTRAP_SUPER_ADMIN_PASSWORD=…

# 3. Build images + start
docker compose -f infra/docker-compose.yml --env-file .env.prod up -d --build

# 4. Watch logs
docker compose -f infra/docker-compose.yml logs -f
```

Caddy automatically issues TLS certificates the first time each domain
serves a request. Allow 30-60s for the initial ACME challenge.

## Updating

```bash
git pull
docker compose -f infra/docker-compose.yml --env-file .env.prod up -d --build
```

## Backups

The data lives in Postgres (managed externally). Snapshot the `zkc`
database on the shared cluster nightly. The volumes mounted here only
contain Caddy certs and ADMS raw logs — recoverable.

## Configuring a customer's ZK device

Point the device's Cloud Server Setting at:

```
Server Address: adms.zkconnect.example.com
Port:           443
HTTPS:          on
```

The device opens an outbound HTTPS connection — no inbound firewall
rules needed at the customer site.

## Things this stack does NOT include

- ZK Agent for LAN-side direct device control (Sprint 2 deliverable).
  When it ships, customers will install a single Docker image (or
  packaged binary) on their LAN; it connects outbound to a WebSocket
  endpoint on this same VPS.
- Centralized log aggregation. For now `docker compose logs` + Caddy's
  access log are it.
