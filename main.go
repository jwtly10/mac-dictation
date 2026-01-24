package main

import (
	"embed"
	"log"
	"runtime"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"github.com/wailsapp/wails/v3/pkg/icons"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	appService := NewApp()

	app := application.New(application.Options{
		Name:        "Mac Dictation",
		Description: "Voice-to-text dictation",
		Services: []application.Service{
			application.NewService(appService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ActivationPolicy: application.ActivationPolicyAccessory,
		},
	})

	systemTray := app.SystemTray.New()

	if runtime.GOOS == "darwin" {
		systemTray.SetTemplateIcon(icons.SystrayMacTemplate)
	}

	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  "Voice Dictation",
		Width:  320,
		Height: 200,
		Hidden: true,
		Mac: application.MacWindow{
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
			InvisibleTitleBarHeight: 30,
		},
		AlwaysOnTop:   true,
		Frameless:     true,
		DisableResize: false,
		URL:           "/",
	})

	systemTray.AttachWindow(window).WindowOffset(5)

	window.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		window.Hide()
		e.Cancel()
	})

	err := app.Run()
	if err != nil {
		log.Fatal(err)
	}
}
