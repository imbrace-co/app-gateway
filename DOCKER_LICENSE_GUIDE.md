# Docker License Guide

This guide explains how to build, run, and deploy the licensed version of the application using Docker.

## Prerequisites

- Docker installed and running
- Access to the application source code
- License secret key

## Configuration

1. Ensure you have a `.env` file in the root directory with the following required configurations:
```env
PUBLIC_SERVER_PORT=9001
LICENSE_DIR=app/licenses/
LICENSE_SECRET=your-secret-key
LICENSE_REQUIRED=true
```

## Building the Licensed Docker Image

1. Build using the license-specific Dockerfile:
```bash
# Build with your secret key
docker build -f Dockerfile.license \
  --build-arg LICENSE_SECRET="your-secret-key" \
  -t myapp:licensed .
```

## Running the Container

1. Basic run command:
```bash
docker run -p 9001:9001 \
  -v "$(pwd)/licenses:/app/licenses" \
  myapp:licensed
```

2. Run with custom environment variables:
```bash
docker run -p 9001:9001 \
  -v "$(pwd)/licenses:/app/licenses" \
  -e NODE_ENV=production \
  -e LOG_LEVEL=info \
  myapp:licensed
```

## Deployment Steps

1. Build the licensed image:
```bash
docker build -f Dockerfile.license \
  --build-arg LICENSE_SECRET="your-secret-key" \
  --build-arg NODE_ENV=production \
  -t myapp:licensed .
```

2. Tag the image for your registry:
```bash
docker tag myapp:licensed your-registry.com/myapp:licensed
```

3. Push to your registry:
```bash
docker push your-registry.com/myapp:licensed
```

4. Deploy using Docker Compose (create a `docker-compose.yml`):
```yaml
version: '3.8'
services:
  app:
    image: your-registry.com/myapp:licensed
    ports:
      - "9001:9001"
    volumes:
      - ./licenses:/app/licenses
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
    restart: unless-stopped
```

5. Start the service:
```bash
docker-compose up -d
```

## License Management

1. Create a license directory:
```bash
mkdir -p licenses
```

2. Generate a license:
```bash
LICENSE_SECRET=your-secret node scripts/generateLicense.js generate 2025-09-12 2025-12-31
```

3. Install the license via API:
```bash
curl -X POST http://localhost:9001/license \
  -H "Content-Type: application/json" \
  -d '{"license": "your-encrypted-license-string"}'
```

## Verification

1. Check if the server is running:
```bash
curl http://localhost:9001
```

2. Verify license status:
```bash
curl http://localhost:9001/license/status
```

## Troubleshooting

1. If the container fails to start, check logs:
```bash
docker logs <container-id>
```

2. Verify license directory permissions:
```bash
docker exec <container-id> ls -la /app/licenses
```

3. Check environment variables:
```bash
docker exec <container-id> env
```

4. If license validation fails:
- Ensure LICENSE_SECRET matches the one used to generate the license
- Check if the license file exists in the mounted volume
- Verify the license hasn't expired
- Check server logs for specific validation errors

## Security Notes

- Keep your LICENSE_SECRET secure and never expose it in logs or error messages
- Use secure methods to pass the LICENSE_SECRET during deployment
- Consider using Docker secrets in production environments
- Regularly rotate license secrets and update deployed containers
- Monitor license validation logs for unauthorized access attempts

## Best Practices

1. Version Control:
   - Tag your images with specific versions
   - Don't rely on the 'latest' tag in production

2. Monitoring:
   - Set up health checks
   - Monitor license validation attempts
   - Set up alerts for license expiration

3. Backup:
   - Regularly backup the license directory
   - Document license renewal procedures

4. Security:
   - Use HTTPS in production
   - Implement rate limiting for license endpoints
   - Restrict access to license management APIs