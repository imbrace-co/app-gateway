# Makefile for building licensed Docker images
# The LICENSE_SECRET and LICENSE_REQUIRED are baked into the image

# Default values
IMAGE_NAME ?= app-gateway
LICENSE_TAG ?= licensed
REGULAR_TAG ?= latest
LICENSE_SECRET ?= 
PORT ?= 9000
VOLUME_PATH ?= $(PWD)/licenses

# Colors for output
GREEN := \033[32m
YELLOW := \033[33m
RED := \033[31m
NC := \033[0m # No Color

.PHONY: help build-licensed build-regular run-licensed run-regular stop clean push pull logs test

# Default target
help: ## Show this help message
	@echo "$(GREEN)Licensed Docker Image Makefile$(NC)"
	@echo "================================="
	@echo ""
	@echo "$(YELLOW)Usage:$(NC)"
	@echo "  make build-licensed LICENSE_SECRET='your-secret-key'"
	@echo "  make run-licensed"
	@echo ""
	@echo "$(YELLOW)Available targets:$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(YELLOW)Variables:$(NC)"
	@echo "  IMAGE_NAME      = $(IMAGE_NAME)"
	@echo "  LICENSE_TAG     = $(LICENSE_TAG)"
	@echo "  REGULAR_TAG     = $(REGULAR_TAG)"
	@echo "  PORT            = $(PORT)"
	@echo "  VOLUME_PATH     = $(VOLUME_PATH)"

build-licensed: ## Build licensed Docker image with secret baked in (requires LICENSE_SECRET)
	@if [ -z "$(LICENSE_SECRET)" ]; then \
		echo "$(RED)ERROR: LICENSE_SECRET is required$(NC)"; \
		echo "$(YELLOW)Usage: make build-licensed LICENSE_SECRET='your-secret-key'$(NC)"; \
		exit 1; \
	fi
	@echo "$(GREEN)Building licensed Docker image...$(NC)"
	@echo "Image: $(IMAGE_NAME):$(LICENSE_TAG)"
	@echo "Secret: $(YELLOW)[HIDDEN FOR SECURITY]$(NC)"
	@docker build \
		-f Dockerfile.license \
		--build-arg LICENSE_SECRET="$(LICENSE_SECRET)" \
		--build-arg LICENSE_REQUIRED=true \
		-t $(IMAGE_NAME):$(LICENSE_TAG) \
		.
	@echo "$(GREEN)✅ Licensed image built successfully!$(NC)"
	@echo "$(YELLOW)⚠️  This image always runs with license validation enabled$(NC)"

build-regular: ## Build regular Docker image (no license requirements)
	@echo "$(GREEN)Building regular Docker image...$(NC)"
	@docker build \
		-f Dockerfile \
		-t $(IMAGE_NAME):$(REGULAR_TAG) \
		.
	@echo "$(GREEN)✅ Regular image built successfully!$(NC)"

run-licensed: ## Run licensed container (license validation always enabled)
	@echo "$(GREEN)Starting licensed container...$(NC)"
	@mkdir -p $(VOLUME_PATH)
	@docker run -d \
		--name $(IMAGE_NAME)-licensed \
		-p $(PORT):$(PORT) \
		-v $(VOLUME_PATH):/app/licenses \
		$(IMAGE_NAME):$(LICENSE_TAG)
	@echo "$(GREEN)✅ Licensed container started!$(NC)"
	@echo "Container: $(IMAGE_NAME)-licensed"
	@echo "Port: http://localhost:$(PORT)"
	@echo "License volume: $(VOLUME_PATH)"
	@echo ""
	@echo "$(YELLOW)Check status:$(NC) make logs"
	@echo "$(YELLOW)Install license:$(NC) curl -X POST http://localhost:$(PORT)/license -H 'Content-Type: application/json' -d '{\"license\":\"your-encrypted-license\"}'"

run-regular: ## Run regular container (no license requirements)
	@echo "$(GREEN)Starting regular container...$(NC)"
	@docker run -d \
		--name $(IMAGE_NAME)-regular \
		-p $(PORT):$(PORT) \
		$(IMAGE_NAME):$(REGULAR_TAG)
	@echo "$(GREEN)✅ Regular container started!$(NC)"
	@echo "Container: $(IMAGE_NAME)-regular"
	@echo "Port: http://localhost:$(PORT)"

stop: ## Stop all containers
	@echo "$(YELLOW)Stopping containers...$(NC)"
	-@docker stop $(IMAGE_NAME)-licensed 2>/dev/null || true
	-@docker stop $(IMAGE_NAME)-regular 2>/dev/null || true
	@echo "$(GREEN)✅ Containers stopped$(NC)"

clean: stop ## Stop containers and remove images
	@echo "$(YELLOW)Cleaning up...$(NC)"
	-@docker rm $(IMAGE_NAME)-licensed 2>/dev/null || true
	-@docker rm $(IMAGE_NAME)-regular 2>/dev/null || true
	-@docker rmi $(IMAGE_NAME):$(LICENSE_TAG) 2>/dev/null || true
	-@docker rmi $(IMAGE_NAME):$(REGULAR_TAG) 2>/dev/null || true
	@echo "$(GREEN)✅ Cleanup complete$(NC)"

logs: ## Show container logs
	@echo "$(GREEN)Container logs:$(NC)"
	@if docker ps --format "table {{.Names}}" | grep -q $(IMAGE_NAME)-licensed; then \
		echo "$(YELLOW)Licensed container:$(NC)"; \
		docker logs $(IMAGE_NAME)-licensed --tail 50; \
	elif docker ps --format "table {{.Names}}" | grep -q $(IMAGE_NAME)-regular; then \
		echo "$(YELLOW)Regular container:$(NC)"; \
		docker logs $(IMAGE_NAME)-regular --tail 50; \
	else \
		echo "$(RED)No running containers found$(NC)"; \
	fi

status: ## Show container status and configuration
	@echo "$(GREEN)Container Status:$(NC)"
	@docker ps --filter name=$(IMAGE_NAME) --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
	@echo ""
	@if docker ps --format "table {{.Names}}" | grep -q $(IMAGE_NAME)-licensed; then \
		echo "$(YELLOW)Licensed container health check:$(NC)"; \
		curl -s http://localhost:$(PORT)/ | jq -r '. | "License Required: \(.licenseRequired // "unknown"), Secret Configured: \(.secretConfigured // "unknown")"' 2>/dev/null || echo "Container not responding"; \
	fi

test-license: ## Test license installation (requires running licensed container)
	@echo "$(GREEN)Testing license installation...$(NC)"
	@if ! docker ps --format "table {{.Names}}" | grep -q $(IMAGE_NAME)-licensed; then \
		echo "$(RED)ERROR: Licensed container not running$(NC)"; \
		echo "$(YELLOW)Run: make run-licensed$(NC)"; \
		exit 1; \
	fi
	@echo "$(YELLOW)Checking server status:$(NC)"
	@curl -s http://localhost:$(PORT)/ | jq . || echo "Failed to connect to server"
	@echo ""
	@echo "$(YELLOW)Checking license status:$(NC)"
	@curl -s http://localhost:$(PORT)/license/status | jq . || echo "No license installed yet"

push: ## Push images to registry (set REGISTRY variable)
	@if [ -z "$(REGISTRY)" ]; then \
		echo "$(RED)ERROR: REGISTRY variable required$(NC)"; \
		echo "$(YELLOW)Usage: make push REGISTRY=your-registry.com$(NC)"; \
		exit 1; \
	fi
	@echo "$(GREEN)Pushing to $(REGISTRY)...$(NC)"
	@docker tag $(IMAGE_NAME):$(LICENSE_TAG) $(REGISTRY)/$(IMAGE_NAME):$(LICENSE_TAG)
	@docker tag $(IMAGE_NAME):$(REGULAR_TAG) $(REGISTRY)/$(IMAGE_NAME):$(REGULAR_TAG)
	@docker push $(REGISTRY)/$(IMAGE_NAME):$(LICENSE_TAG)
	@docker push $(REGISTRY)/$(IMAGE_NAME):$(REGULAR_TAG)
	@echo "$(GREEN)✅ Images pushed successfully!$(NC)"

# Development targets
dev-build: ## Quick development build (licensed version)
	@$(MAKE) build-licensed LICENSE_SECRET="dev-secret-key-123"

dev-run: dev-build ## Build and run development licensed container
	@$(MAKE) stop
	@$(MAKE) run-licensed
	@sleep 2
	@$(MAKE) status

# Build info
build-info: ## Show build information
	@echo "$(GREEN)Build Information:$(NC)"
	@echo "Image Name: $(IMAGE_NAME)"
	@echo "Licensed Tag: $(LICENSE_TAG)" 
	@echo "Regular Tag: $(REGULAR_TAG)"
	@echo "Port: $(PORT)"
	@echo "License Volume: $(VOLUME_PATH)"
	@echo ""
	@echo "$(YELLOW)Docker Images:$(NC)"
	@docker images $(IMAGE_NAME) 2>/dev/null || echo "No images found"
decode-local:
	@echo "decoding local"
	@echo "./ansible/local"
	sops -d ./ansible/local/secrets.enc.env > ./ansible/local/.env

decode-dev:
	@echo "decoding dev"
	@echo "./ansible/dev"
	sops -d ./ansible/dev/secrets.enc.env > ./ansible/dev/.env

decode-dev3:
	@echo "decoding dev"
	@echo "./ansible/dev"
	sops -d ./ansible/dev3/secrets.enc.env > ./ansible/dev3/.env

decode-prod:
	@echo "decoding prod"
	@echo "./ansible/prod"
	sops -d ./ansible/prod/secrets.enc.env > ./ansible/prod/.env

decode-stg:
	@echo "decoding stg"
	@echo "./ansible/stg"
	sops -d ./ansible/stg/secrets.enc.env > ./ansible/stg/.env
decode-aistg3:
	@echo "decoding stg"
	@echo "./ansible/stg"
	sops -d ./ansible/aistg3/secrets.enc.env > ./ansible/aistg3/.env
decode-demo:
	@echo "decoding demo"
	@echo "./ansible/demo"
	sops -d ./ansible/demo/secrets.enc.env > ./ansible/demo/.env


encode-dev:
	@echo "encoding dev"
	@echo "./ansible/dev"
	sops -e ./ansible/dev/.env > ./ansible/dev/secrets.enc.env

encode-dev3:
	@echo "encoding dev3"
	@echo "./ansible/dev3"
	sops -e ./ansible/dev3/.env > ./ansible/dev3/secrets.enc.env

encode-prod:
	@echo "encoding prod"
	@echo "./ansible/prod"
	sops -e ./ansible/prod/.env > ./ansible/prod/secrets.enc.env

encode-stg:
	@echo "encoding stg"
	@echo "./ansible/stg"
	sops -e ./ansible/stg/.env > ./ansible/stg/secrets.enc.env

encode-aistg3:
	@echo "encoding aistg3"
	@echo "./ansible/aistg3"
	sops -e ./ansible/aistg3/.env > ./ansible/aistg3/secrets.enc.env

encode-demo:
	@echo "encoding demo"
	@echo "./ansible/demo"
	sops -e ./ansible/demo/.env > ./ansible/demo/secrets.enc.env
