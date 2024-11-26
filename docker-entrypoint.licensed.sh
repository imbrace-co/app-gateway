#!/bin/bash
set -e

if [ -z "$LICENSE_SECRET" ]; then
    echo "ERROR: LICENSE_SECRET not set. Licensed image requires a secret."
    exit 1
fi

echo "Starting LICENSED container..."
exec node dist/index.js --license-required --secret "$LICENSE_SECRET" "$@"
