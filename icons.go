package main

import (
	"embed"

	"github.com/wailsapp/wails/v3/pkg/icons"
)

//go:embed icons/*
var iconAssets embed.FS

type TrayIcon int

const (
	TrayIconDefault TrayIcon = iota
	TrayIconRecording
	TrayIconTranscribing
	TrayIconLogo
)

var trayIcons = map[TrayIcon][]byte{}

func init() {
	if data, err := iconAssets.ReadFile("icons/default.png"); err == nil {
		trayIcons[TrayIconDefault] = data
	} else {
		trayIcons[TrayIconDefault] = icons.SystrayMacTemplate
	}

	if data, err := iconAssets.ReadFile("icons/recording.png"); err == nil {
		trayIcons[TrayIconRecording] = data
	} else {
		trayIcons[TrayIconRecording] = icons.SystrayMacTemplate
	}

	if data, err := iconAssets.ReadFile("icons/transcribing.png"); err == nil {
		trayIcons[TrayIconTranscribing] = data
	} else {
		trayIcons[TrayIconTranscribing] = icons.SystrayMacTemplate
	}

	if data, err := iconAssets.ReadFile("icons/logo.png"); err == nil {
		trayIcons[TrayIconLogo] = data
	} else {
		trayIcons[TrayIconLogo] = icons.SystrayMacTemplate
	}
}

func GetTrayIcon(icon TrayIcon) []byte {
	if data, ok := trayIcons[icon]; ok {
		return data
	}
	return icons.SystrayMacTemplate
}
