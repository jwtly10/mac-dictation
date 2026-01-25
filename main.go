package main

import (
	"context"
	"embed"
	"log/slog"
	"mac-dictation/internal/database"
	"mac-dictation/internal/logging"
	"os"
	"runtime"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	logCloser, err := logging.Setup()
	if err != nil {
		slog.Error("failed to setup logging", "error", err)
		os.Exit(1)
	}
	if logCloser != nil {
		defer logCloser.Close()
	}

	dbPath, err := database.GetDatabasePath()
	if err != nil {
		slog.Error("failed to get database path", "error", err)
		os.Exit(1)
	}

	db, err := database.Connect(dbPath)
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
		systemTray.SetTemplateIcon(GetTrayIcon(TrayIconLogo))
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
	})

	menuStop := trayMenu.Add("Stop Recording")
	menuStop.OnClick(func(_ *application.Context) {
		appService.StopRecording()
	})

	menuCancel := trayMenu.Add("Cancel Recording")
	menuCancel.OnClick(func(_ *application.Context) {
		appService.CancelRecording()
	})

	trayMenu.AddSeparator()
	trayMenu.Add("Settings...").OnClick(func(_ *application.Context) {
		appService.ShowSettings()
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
