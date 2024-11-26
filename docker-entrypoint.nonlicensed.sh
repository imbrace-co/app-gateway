#!/bin/bash
set -e

echo "Starting NON-LICENSED container..."
exec node dist/index.js "$@"
