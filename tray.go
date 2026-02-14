package main

import (
	"context"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func (a *App) ServiceStartup(_ context.Context, _ application.ServiceOptions) error {
	return a.recorder.Init()
}

func (a *App) ServiceShutdown() error {
	return a.recorder.Shutdown()
}

func (a *App) SetApplication(app *application.App) {
	a.app = app
}

func (a *App) SetWindow(window *application.WebviewWindow) {
	a.window = window
}

func (a *App) SetSystemTray(tray *application.SystemTray) {
	a.systemTray = tray
}

func (a *App) SetMenuItems(start, stop, cancel *application.MenuItem) {
	a.menuStartRecording = start
	a.menuStopRecording = stop
	a.menuCancelRecording = cancel
	a.updateMenuState()
}

func (a *App) HideWindow() {
	if a.window != nil {
		a.window.Hide()
	}
}

func (a *App) ShowWindow() {
	if a.window != nil {
		a.window.Show()
		a.window.Focus()
	}
}

func (a *App) OnTrayClick() {
	if a.isRecording() && TrayClickStopsRecording {
		a.StopRecording()
		return
	}

	if a.window != nil && a.window.IsVisible() {
		a.window.Hide()
	} else {
		a.ShowWindow()
	}
}
