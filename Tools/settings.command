#!/bin/bash
set -euo pipefail
PACKAGE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
exec "$PACKAGE_DIR/START.command" --setup
