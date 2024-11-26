# Docker Build Guide

## Quick Start with Makefile

### 1. Build Licensed Image
```bash
# Build with your secret key
make build-licensed LICENSE_SECRET='my-secret-key-123'
```

### 2. Run Licensed Container  
```bash
# Run container with license validation enabled
make run-licensed
```

### 3. Check Status
```bash
# View container status and health
make status
```

### 4. Install License
```bash
# Generate encrypted license first
node scripts/generateLicense.js "my-secret-key-123" "2024-01-01T00:00:00Z" "2025-12-31T23:59:59Z" "My Company"

# Then install it (use the encrypted string from above)
curl -X POST http://localhost:9000/license \
  -H "Content-Type: application/json" \
  -d '{"license": "your-encrypted-license-string"}'
```

## Available Makefile Commands

| Command | Description |
|---------|-------------|
| `make help` | Show all available commands |
| `make build-licensed LICENSE_SECRET='key'` | Build licensed image |
| `make build-regular` | Build regular image (no license) |
| `make run-licensed` | Run licensed container |
| `make run-regular` | Run regular container |
| `make stop` | Stop all containers |
| `make clean` | Stop containers and remove images |
| `make logs` | Show container logs |
| `make status` | Show container status |
| `make test-license` | Test license endpoints |

## Development Commands

```bash
# Quick development setup (uses dev secret)
make dev-build

# Build and run in one command
make dev-run

# View build information
make build-info
```

## Custom Configuration

```bash
# Use custom image name and tag
make build-licensed LICENSE_SECRET='key' IMAGE_NAME='myapp' LICENSE_TAG='v1.0'

# Use custom port
make run-licensed PORT=8080

# Use custom license storage path
make run-licensed VOLUME_PATH='/custom/license/path'
```

## Registry Operations

```bash
# Push to custom registry
make push REGISTRY='your-registry.com'
```

## Manual Build (Alternative)

If you prefer not to use the Makefile:

```bash
# Build licensed image manually
./build-license-image.sh "your-secret-key" "app-gateway:licensed"

# Run manually
docker run -p 9000:9000 -v ./licenses:/app/licenses app-gateway:licensed
```

## Security Notes

⚠️ **Important Security Features:**

1. **License Requirements Baked In**: The licensed image always runs with license validation enabled
2. **Secret Baked In**: The decryption secret is embedded in the image at build time
3. **No Runtime Override**: Neither license requirements nor the secret can be changed at runtime
4. **Environment Variables**: Configuration is set via environment variables that cannot be overridden
5. **ENTRYPOINT Protection**: Uses Docker ENTRYPOINT to prevent command injection

## Troubleshooting

### Container Won't Start
```bash
# Check logs
make logs

# Common issue: missing LICENSE_SECRET during build
make build-licensed LICENSE_SECRET='your-key'
```

### License Installation Fails
```bash
# Check if container is running with license validation
make status

# Verify license format
curl http://localhost:9000/license/status
```

### Port Already in Use
```bash
# Use different port
make run-licensed PORT=8080
```
