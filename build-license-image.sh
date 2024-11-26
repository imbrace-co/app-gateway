#!/bin/bash

# Build script for creating a licensed Docker image
# Both LICENSE_REQUIRED and LICENSE_SECRET are baked into the image at build time

set -e

# Check if secret is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <LICENSE_SECRET> [IMAGE_TAG]"
    echo ""
    echo "Example: $0 'my-secret-key-123' myapp:licensed"
    echo "Example: $0 'my-secret-key-123'  # Uses default tag"
    echo ""
    echo "💡 TIP: Use Makefile for easier management:"
    echo "make build-licensed LICENSE_SECRET='my-secret-key-123'"
    exit 1
fi

LICENSE_SECRET="$1"
IMAGE_TAG="${2:-app-gateway:licensed}"

echo "Building licensed Docker image..."
echo "Image tag: $IMAGE_TAG"
echo "License required: YES (baked in)"
echo "Secret configured: YES (hidden for security)"
echo ""

# Build the Docker image with both license requirement and secret baked in
docker build \
    -f Dockerfile.license \
    --build-arg LICENSE_SECRET="$LICENSE_SECRET" \
    --build-arg LICENSE_REQUIRED=true \
    -t "$IMAGE_TAG" \
    .

echo ""
echo "✅ Licensed Docker image built successfully!"
echo "Image: $IMAGE_TAG"
echo ""
echo "To run the container:"
echo "docker run -p 9000:9000 -v /path/to/license-storage:/app/licenses $IMAGE_TAG"
echo ""
echo "⚠️  This image always runs with license validation enabled!"
echo "⚠️  Both LICENSE_REQUIRED and LICENSE_SECRET are baked in and cannot be overridden!"
echo ""
echo "💡 Use 'make run-licensed' for easier container management"
