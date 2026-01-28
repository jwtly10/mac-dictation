APP_NAME := mac-dictation

.PHONY: all run check test build clean dev package install

all: run

run:
	wails3 dev

bind:
	wails3 generate bindings -ts

check:
	go build -o /dev/null .

test:
	go test ./... -v

build:
	wails3 build

package:
	wails3 task darwin:package

clean:
	rm -rf build/bin
	rm -rf frontend/dist

status:
	@echo "Checking $(APP_NAME) status..."
	@if pgrep -x "$(APP_NAME)" > /dev/null; then \
		echo "$(APP_NAME) is running (PID: $$(pgrep -x "$(APP_NAME)"))"; \
	else \
		echo "$(APP_NAME) is not running"; \
	fi

install_app:
	@echo "Installing application..."
	@if pgrep -x "$(APP_NAME)" > /dev/null; then \
		echo "⚠️  $(APP_NAME) is currently running (PID: $$(pgrep -x "$(APP_NAME)"))"; \
		echo "Stopping..."; \
		pkill -x "$(APP_NAME)"; \
		echo "Waiting for the application to close..."; \
		sleep 1; \
		echo "✓ Application stopped."; \
	fi
	@if [ -d "/Applications/$(APP_NAME).app" ]; then \
		mv /Applications/$(APP_NAME).app ~/.Trash/$(APP_NAME)-$$(date +%Y%m%d-%H%M%S).app; \
		echo "✓ Moved old version to Trash"; \
	fi
	@cp -R bin/$(APP_NAME).app /Applications/
	@echo "✓ Installed to /Applications/$(APP_NAME).app"

install: build package install_app
