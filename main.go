package main

import (
	"context"
	"embed"
	"log/slog"
	"mac-dictation/internal/database"
	"os"
	"runtime"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	db, err := database.Connect("dictation.db")
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	err = database.RunMigrations(context.Background(), db)
	if err != nil {
		slog.Error("failed to run migrations", "error", err)
		os.Exit(1)
	}

	appService := NewApp(db)

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

	appService.SetApplication(app)

	systemTray := app.SystemTray.New()

	if runtime.GOOS == "darwin" {
		systemTray.SetTemplateIcon(GetTrayIcon(TrayIconDefault))
	}

	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:         "Voice Dictation",
		Width:         600,
		Height:        480,
		Hidden:        false,
		AlwaysOnTop:   false,
		Frameless:     true,
		DisableResize: false,
		URL:           "/",
		Mac: application.MacWindow{
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInsetUnified,
			InvisibleTitleBarHeight: 0,
		},
	})

	appService.SetWindow(window)
	appService.SetSystemTray(systemTray)

	trayMenu := app.NewMenu()
	trayMenu.Add("Show Window").OnClick(func(_ *application.Context) {
		appService.ShowWindow()
	})
	trayMenu.AddSeparator()

	menuStart := trayMenu.Add("Start Recording")
	menuStart.OnClick(func(_ *application.Context) {
		appService.StartRecording()
		appService.ShowWindow()
	})

	menuStop := trayMenu.Add("Stop Recording")
	menuStop.OnClick(func(_ *application.Context) {
		appService.StopRecording()
		appService.ShowWindow()
	})

	menuCancel := trayMenu.Add("Cancel Recording")
	menuCancel.OnClick(func(_ *application.Context) {
		appService.CancelRecording()
	})

	trayMenu.AddSeparator()
	trayMenu.Add("Quit").OnClick(func(_ *application.Context) {
		app.Quit()
	})

	appService.SetMenuItems(menuStart, menuStop, menuCancel)
	systemTray.SetMenu(trayMenu)

	systemTray.OnClick(func() {
		appService.OnTrayClick()
	})

	window.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		window.Hide()
		e.Cancel()
	})

	err = app.Run()
	if err != nil {
		slog.Error("app failed to run", "error", err)
		panic(err)
	}
}
