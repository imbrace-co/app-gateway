#!/bin/bash

# This script ensures license-required mode cannot be bypassed
# Both license requirement and secret are baked into the image at build time

set -e

# Check if LICENSE_SECRET is set
if [ -z "$LICENSE_SECRET" ]; then
    echo "ERROR: LICENSE_SECRET not set. This is a licensed version that requires a secret."
    exit 1
fi

# Check if LICENSE_REQUIRED is set (should always be true for this image)
if [ -z "$LICENSE_REQUIRED" ]; then
    echo "ERROR: LICENSE_REQUIRED not set. This image requires license validation."
    exit 1
fi

# Display configuration (baked into image)
echo "Starting licensed application..."
echo "License validation: $LICENSE_REQUIRED"
echo "Secret configured: YES (hidden)"
echo "Configuration is immutable and cannot be overridden."

# Set environment variables for the application to read
export LICENSE_REQUIRED="$LICENSE_REQUIRED"
export LICENSE_SECRET="$LICENSE_SECRET"

# Run with command line arguments
exec node dist/index.js --license-required --secret "$LICENSE_SECRET" "$@"
