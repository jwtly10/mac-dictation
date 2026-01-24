.PHONY: all run check test build clean dev

all: check run

run:
	wails3 dev

dev: run

check:
	go build -o /dev/null .

test:
	go test ./... -v

build:
	wails3 build

clean:
	rm -rf build/bin
	rm -rf frontend/dist
