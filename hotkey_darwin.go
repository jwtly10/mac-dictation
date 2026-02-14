package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa -framework Carbon

#include <Carbon/Carbon.h>
#include <Cocoa/Cocoa.h>

extern void goHotkeyCallback(int hotkeyID);

static EventHandlerUPP handlerUPP = NULL;

static OSStatus hotkeyHandler(EventHandlerCallRef nextHandler, EventRef event, void *userData) {
    EventHotKeyID hkID;
    GetEventParameter(event, kEventParamDirectObject, typeEventHotKeyID, NULL, sizeof(hkID), NULL, &hkID);
    goHotkeyCallback(hkID.id);
    return noErr;
}

static void installHotkeyHandler() {
    if (handlerUPP != NULL) return;
    handlerUPP = NewEventHandlerUPP(hotkeyHandler);
    EventTypeSpec eventType = {kEventClassKeyboard, kEventHotKeyPressed};
    InstallApplicationEventHandler(handlerUPP, 1, &eventType, NULL, NULL);
}

// Register a global hotkey. Returns 0 on success.
// keyCode: virtual key code (e.g. 0x61 for F6)
// modifiers: Carbon modifier flags (0 for no modifiers)
// hotkeyID: unique identifier for this hotkey
static int registerHotkey(int keyCode, int modifiers, int hotkeyID) {
    installHotkeyHandler();
    EventHotKeyID hkID = {'MDIC', hotkeyID};
    EventHotKeyRef ref;
    OSStatus status = RegisterEventHotKey(keyCode, modifiers, hkID, GetApplicationEventTarget(), 0, &ref);
    return (int)status;
}
*/
import "C"
import (
	"fmt"
	"log/slog"
	"sync"
)

// macOS virtual key codes for common keys
const (
	KeyCodeF1  = 0x7A
	KeyCodeF2  = 0x78
	KeyCodeF3  = 0x63
	KeyCodeF4  = 0x76
	KeyCodeF5  = 0x60
	KeyCodeF6  = 0x61
	KeyCodeF7  = 0x62
	KeyCodeF8  = 0x64
	KeyCodeF9  = 0x65
	KeyCodeF10 = 0x6D
	KeyCodeF11 = 0x67
	KeyCodeF12 = 0x6F
)

// Carbon modifier flags
const (
	ModCmd     = 0x0100 // cmdKey
	ModShift   = 0x0200 // shiftKey
	ModOption  = 0x0800 // optionKey
	ModControl = 0x1000 // controlKey
)

var (
	hotkeyCallbacks   = map[int]func(){}
	hotkeyCallbacksMu sync.RWMutex
	nextHotkeyID      = 1
)

//export goHotkeyCallback
func goHotkeyCallback(hotkeyID C.int) {
	hotkeyCallbacksMu.RLock()
	cb, ok := hotkeyCallbacks[int(hotkeyID)]
	hotkeyCallbacksMu.RUnlock()
	if ok {
		go cb()
	}
}

// RegisterGlobalHotkey registers a system-wide hotkey.
// keyCode: one of the KeyCode* constants
// modifiers: bitwise OR of Mod* constants (0 for no modifiers)
// callback: function to call when the hotkey is pressed
func RegisterGlobalHotkey(keyCode int, modifiers int, callback func()) error {
	hotkeyCallbacksMu.Lock()
	id := nextHotkeyID
	nextHotkeyID++
	hotkeyCallbacks[id] = callback
	hotkeyCallbacksMu.Unlock()

	status := C.registerHotkey(C.int(keyCode), C.int(modifiers), C.int(id))
	if status != 0 {
		hotkeyCallbacksMu.Lock()
		delete(hotkeyCallbacks, id)
		hotkeyCallbacksMu.Unlock()
		return fmt.Errorf("failed to register hotkey (OSStatus %d)", status)
	}

	slog.Info("registered global hotkey", "keyCode", fmt.Sprintf("0x%X", keyCode), "modifiers", modifiers, "id", id)
	return nil
}
