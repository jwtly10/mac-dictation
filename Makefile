.PHONY: all run check test build clean dev package release

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

release: build package