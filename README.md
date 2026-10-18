# CivicFix

CivicFix is a community civic issue tracker. Residents can submit a photo, description and map location; reports receive an automatic category and department, possible nearby duplicates are flagged, and the public map/dashboard follows each report through resolution.

## Start locally

Requirements: Docker Desktop (or Docker Engine) with the Compose plugin.

1. Copy `.env.example` to `.env`.
2. Replace `POSTGRES_PASSWORD` and `ADMIN_API_KEY` with long, unique secrets. Leave `OPENAI_API_KEY` blank for the built-in classifier, or add an OpenAI API key for model-based categorization.
3. Start the app:

   ```sh
   docker compose up --build
   ```

4. Open [http://localhost:8080](http://localhost:8080). The API health check is at `http://localhost:8080/api/health`.

PostgreSQL data and uploaded photos are stored in Docker volumes and survive container restarts. Stop the stack with `docker compose down`; `docker compose down -v` deletes those volumes and their data.

## Deploy on a Linux VPS with HTTPS

This is the simplest self-hosted deployment. Choose a small Ubuntu VPS, point a DNS `A` record (and optional `AAAA`) for your hostname at its public IP, and allow inbound TCP ports 80 and 443 (plus UDP 443) in the host and provider firewalls. Install Docker Engine and the Compose plugin on the server, copy this project there, and:

1. Create `.env` from `.env.example`. Set strong unique `POSTGRES_PASSWORD` and `ADMIN_API_KEY` values, set `DOMAIN` to the DNS hostname, optionally set `OPENAI_API_KEY`, and set `CORS_ORIGINS` to the public origin (for example, `https://civicfix.example.com`).
2. Start the HTTPS profile:

   ```sh
   docker compose --profile production up --build -d
   ```

3. Caddy obtains and renews the HTTPS certificate once DNS resolves and ports 80/443 reach the VPS. Visit `https://<your-domain>`.
4. For updates, pull/copy the new version and run the same Compose command again. Back up the `postgres_data` and `uploads` volumes regularly.

For a local install, `CORS_ORIGINS=*` is fine because the web UI and API share one origin. For a public deployment set it to the exact site origin. Keep `.env` private and out of Git. The API is proxied behind the web server; do not publish the database port.

## Staff status updates

Select **Staff access** in the site header, enter `ADMIN_API_KEY`, and update a report from the report list. The key is sent only to the API in an HTTPS header. Do not give residents the staff key.

The write endpoint is `PATCH /api/complaints/{id}/status` with header `X-Admin-Key` and JSON such as `{"status":"In progress"}`. Allowed statuses are `Reported`, `Acknowledged`, `In progress`, and `Resolved`.

## How the MVP works

- Categories are assigned with the OpenAI Responses API when `OPENAI_API_KEY` is set; otherwise a keyword fallback keeps local development useful. The API key stays on the server.
- A possible duplicate is flagged when an unresolved report in the same category is within 100 metres. This is a hint for staff, not an automatic merge.
- The map uses OpenStreetMap tiles. Location is public with a report; the form asks the resident to confirm this before submitting.
- Photos are limited to JPG, PNG or WebP and 5 MB.

## Before a real public pilot

This is a usable MVP foundation, not a hardened municipal production system. Add resident/staff identity and roles, abuse throttling and spam controls, photo moderation and retention rules, database migrations/backups, monitoring, and an agreed departmental workflow before inviting a large public audience. Secure the staff key as a managed secret and rotate it if exposed. Pilot only where the relevant campus/local authority has approved the intake and response process.

## Project layout

```text
backend/       FastAPI API, classification, duplicate matching, photo storage
frontend/      React/Vite app, report form, dashboard and maps
docker-compose.yml
Caddyfile      HTTPS reverse proxy for the production profile
```

