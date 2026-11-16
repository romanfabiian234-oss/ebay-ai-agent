#!/bin/bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
"$DIR/stop_backend.command"
sleep 1
"$DIR/start_backend.command"
