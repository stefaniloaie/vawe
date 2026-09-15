#!/usr/bin/env bash
set -euo pipefail

.venv/bin/python backend/manage.py runserver 0.0.0.0:8000 &
api_pid=$!

cleanup() {
  kill "$api_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

npm exec vite -- --host 0.0.0.0 --port 3000
