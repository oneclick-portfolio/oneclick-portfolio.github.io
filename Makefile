IMAGE  ?= portfolio
TAG    ?= latest
PORT   ?= 8080

.PHONY: help dev test build run stop clean

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*##"}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

# ── Development ──────────────────────────────────────────────────────────────

dev: ## Run local app server (static site + GitHub OAuth/deploy APIs)
	@echo "Serving on http://localhost:$(PORT)"
	PORT=$(PORT) node server.js

test: ## Run schema validation tests
	npm test

# ── Docker ───────────────────────────────────────────────────────────────────

build: ## Build the Docker image (runs tests inside build stage)
	docker build -t $(IMAGE):$(TAG) .

run: ## Run the Docker container (builds first if image is absent)
	@docker image inspect $(IMAGE):$(TAG) > /dev/null 2>&1 || $(MAKE) build
	docker run --rm -d \
	  --name $(IMAGE) \
	  -p $(PORT):80 \
	  $(IMAGE):$(TAG)
	@echo "Running at http://localhost:$(PORT)"

stop: ## Stop the running container
	docker stop $(IMAGE) 2>/dev/null || true

clean: stop ## Stop container and remove image
	docker rmi $(IMAGE):$(TAG) 2>/dev/null || true
