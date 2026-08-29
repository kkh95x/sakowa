#!/usr/bin/env bash
# Run on the production server from the BotHub project directory.
set -euo pipefail

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prd"

echo "== Port 3320 =="
if curl -sf --max-time 5 http://127.0.0.1:3320/ >/dev/null; then
  echo "OK: app responds on http://127.0.0.1:3320/"
else
  echo "FAIL: nothing on http://127.0.0.1:3320/ (nginx will return 502)"
fi

echo
echo "== Docker =="
$COMPOSE ps || true

echo
echo "== App logs (last 40 lines) =="
$COMPOSE logs app --tail 40 || true

echo
echo "== Telegram Bot API =="
$COMPOSE ps telegram-bot-api || true
$COMPOSE logs telegram-bot-api --tail 30 || true

echo
echo "== Nginx upstream test =="
sudo nginx -t 2>&1 || true
