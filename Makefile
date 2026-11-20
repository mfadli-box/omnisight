.PHONY: init up down up-dev down-dev build build-agent build-agent-linux build-agent-windows logs ps

DEV_COMPOSE = docker compose -p omnisight-dev -f docker-compose.yml -f docker-compose.dev.yml
ifeq ($(DEV_NETWORK),blackbox)
DEV_COMPOSE += -f docker-compose.dev-blackbox.yml
endif

up:
	docker compose up -d --build

down:
	docker compose down

up-dev:
	$(DEV_COMPOSE) up -d --build

down-dev:
	$(DEV_COMPOSE) down

build:
	docker compose build

build-agent: build-agent-linux build-agent-windows

build-agent-linux:
	cd osc_auto && mkdir -p dist && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags='-s -w' -o dist/omnisight-agent-linux-amd64 ./cmd/agent

build-agent-windows:
	cd osc_auto && mkdir -p dist && CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags='-s -w' -o dist/omnisight-agent-windows-amd64.exe ./cmd/agent

logs:
	docker compose logs -f --tail=100

ps:
	docker compose ps
