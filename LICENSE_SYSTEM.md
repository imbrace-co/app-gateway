# License System Documentation

## Overview

This application supports an encrypted license system where:
1. Licenses are encrypted using AES-256-CBC encryption
2. The server decrypts licenses using a provided secret key
3. License validation includes date checking and signature verification

## Command Line Arguments

```bash
# Enable license validation
npm start -- --license-required

# Enable license validation with secret for decryption
npm start -- --license-required --secret "your-secret-key"
```

## Docker Usage

### Building Licensed Docker Image

The `Dockerfile.license` creates a **licensed version** where license requirements are **baked into the image** and cannot be overridden:

```bash
# Build licensed image with secret baked in
./build-license-image.sh "your-secret-key" "myapp:licensed"

# Or manually build
docker build -f Dockerfile.license --build-arg LICENSE_SECRET="your-secret-key" -t myapp:licensed .
```

### Running Licensed Container

```bash
# Run licensed container (license validation is always enabled)
docker run -p 9000:9000 -v /path/to/licenses:/app/licenses myapp:licensed

# The container ALWAYS runs with:
# - --license-required (cannot be disabled)
# - --secret "your-baked-in-secret" (cannot be changed)
```

**Security Features:**
- ✅ License requirements cannot be bypassed
- ✅ Secret is baked into image at build time
- ✅ No runtime overrides possible
- ✅ Uses ENTRYPOINT to prevent parameter injection

## API Endpoints

### POST /license
Install an encrypted license

**Request:**
```json
{
  "license": "base64-encoded-encrypted-license-string"
}
```

**Response (Success):**
```json
{
  "message": "License installed successfully",
  "license": {
    "startDate": "2024-01-01T00:00:00Z",
    "endDate": "2025-12-31T23:59:59Z",
    "licensee": "My Company",
    "isValid": true,
    "daysRemaining": 365
  }
}
```

### GET /license
Get current license information

**Response:**
```json
{
  "startDate": "2024-01-01T00:00:00Z",
  "endDate": "2025-12-31T23:59:59Z", 
  "licensee": "My Company",
  "isValid": true,
  "daysRemaining": 365
}
```

### GET /license/status
Get license validation status

**Response:**
```json
{
  "isValid": true,
  "message": "License is valid"
}
```

## Generating Encrypted Licenses

Use the provided script to generate encrypted licenses:

```bash
# Generate encrypted license
node scripts/generateLicense.js "your-secret" "2024-01-01T00:00:00Z" "2025-12-31T23:59:59Z" "My Company"
```

This will output:
- The encrypted license string
- A ready-to-use curl command
- License details for verification

## Example Usage

1. **Generate a license:**
```bash
node scripts/generateLicense.js "my-secret-123" "2024-01-01T00:00:00Z" "2025-12-31T23:59:59Z" "Acme Corp"
```

2. **Start server with license validation:**
```bash
npm run build
npm start -- --license-required --secret "my-secret-123"
```

3. **Install the license:**
```bash
curl -X POST http://localhost:9000/license \
  -H "Content-Type: application/json" \
  -d '{"license": "your-encrypted-license-string-here"}'
```

4. **Check license status:**
```bash
curl http://localhost:9000/license
```

## Security Features

- **AES-256-CBC encryption** - Industry standard encryption
- **Secret-based decryption** - Only valid with correct secret
- **Date validation** - Automatic expiry checking
- **Signature verification** - Prevents license tampering
- **Secure storage** - Licenses stored in mounted volumes

## Error Handling

- **403 Forbidden** - Invalid, expired, or missing license
- **400 Bad Request** - Malformed license data
- **500 Internal Error** - Server configuration issues

## File Storage

- Licenses are stored in: `/app/licenses/license.json`
- Use `LICENSE_DIR` environment variable to customize storage location
- Mount a volume to persist licenses across container restarts

## License Validation Logic

1. **Decryption** - License decrypted using provided secret
2. **Format validation** - JSON structure and required fields checked  
3. **Date validation** - Current date must be within license period
4. **Signature verification** - HMAC signature prevents tampering

When license validation is enabled (`--license-required`), all API endpoints except `/license/*` and `/` (health check) require a valid license.
