import {useState, useCallback, useMemo, useEffect} from 'react';
import {Events} from '@wailsio/runtime';
import {App as AppService} from '../bindings/mac-dictation';
import {useRecording} from './hooks/useRecording';
import {useThreads} from './hooks/useThreads';
import {useMessages} from './hooks/useMessages';
import {Sidebar, ChatView, TitleBar, ThreadHeader, Settings, AlertToast} from './components';
import {AlertProvider, useAlerts} from './contexts/AlertContext';
import type {TranscriptionCompletedEvent} from './types';

type View = 'main' | 'settings';

function useErrorListener() {
    const {addAlert} = useAlerts();

    useEffect(() => {
        const unsub = Events.On('error', (ev: Events.WailsEvent) => {
            addAlert('error', ev.data as string);
        });
        return () => unsub();
    }, [addAlert]);
}

function AppContent() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(224);
    const [currentView, setCurrentView] = useState<View>('main');
    const [apiKeysConfigured, setApiKeysConfigured] = useState(false);

    useErrorListener();

    const threads = useThreads();
    const messages = useMessages(threads.activeThreadId);

    const handleTranscriptionComplete = useCallback((event: TranscriptionCompletedEvent) => {
        if (event.isNewThread && event.thread) {
            threads.addThread(event.thread);
        } else if (event.thread) {
            threads.updateThread(event.thread);
        }
        messages.addMessage(event.message);
    }, [threads, messages]);

    const recordingOptions = useMemo(() => ({
        onTranscriptionComplete: handleTranscriptionComplete,
    }), [handleTranscriptionComplete]);

    const recording = useRecording(recordingOptions);

    const handleNewThread = useCallback(() => {
        threads.selectThread(null);
        messages.clearMessages();
        setSidebarOpen(false);
    }, [threads, messages]);

    const handleSelectThread = useCallback((threadId: number | null) => {
        threads.selectThread(threadId);
        setSidebarOpen(false);
    }, [threads]);

    const handleTitleChange = useCallback((newTitle: string) => {
        if (threads.activeThreadId) {
            threads.renameThread(threads.activeThreadId, newTitle);
        }
    }, [threads]);

    const handleOpenSettings = useCallback(() => {
        setCurrentView('settings');
        setSidebarOpen(false);
    }, []);

    const handleBackFromSettings = useCallback(() => {
        setCurrentView('main');
    }, []);

    useEffect(() => {
        const unsub = Events.On('settings:show', () => {
            setCurrentView('settings');
        });
        return () => unsub();
    }, []);

    const checkApiKeys = useCallback(async () => {
        try {
            const configured = await AppService.AreAPIKeysConfigured();
            setApiKeysConfigured(configured);
            if (!configured) {
                setCurrentView('settings');
            }
        } catch (err) {
            console.error('Failed to check API keys:', err);
            setApiKeysConfigured(false);
            setCurrentView('settings');
        }
    }, []);

    useEffect(() => {
        checkApiKeys();
    }, [checkApiKeys]);

    if (currentView === 'settings') {
        return (
            <div className="h-screen flex flex-col bg-black/50 backdrop-blur-xl overflow-hidden relative">
                <TitleBar onHide={recording.hideWindow}/>
                <Settings onBack={handleBackFromSettings} onKeysUpdated={checkApiKeys}/>
                <AlertToast/>
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col bg-black/50 backdrop-blur-xl overflow-hidden relative">
            <Sidebar
                threads={threads.threads}
                activeThreadId={threads.activeThreadId}
                generatingTitleFor={threads.generatingTitleFor}
                isOpen={sidebarOpen}
                width={sidebarWidth}
                onWidthChange={setSidebarWidth}
                onToggle={() => setSidebarOpen(!sidebarOpen)}
                onSelectThread={handleSelectThread}
                onNewThread={handleNewThread}
                onDeleteThread={threads.deleteThread}
                onSetThreadPinned={threads.setThreadPinned}
                onOpenSettings={handleOpenSettings}
            />

            <TitleBar onHide={recording.hideWindow}/>

            <ThreadHeader
                title={threads.activeThread?.name ?? 'New Thread'}
                hasTranscript={!!recording.lastTranscript}
                copied={recording.copied}
                isGeneratingTitle={threads.generatingTitleFor === threads.activeThreadId}
                onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
                onTitleChange={handleTitleChange}
                onCopy={recording.handleCopy}
            />

            <main className="flex-1 min-h-0">
                <ChatView
                    messages={messages.messages}
                    loading={messages.loading}
                    recordingState={recording.state}
                    durationSecs={recording.durationSecs}
                    recordingDisabled={!apiKeysConfigured}
                    interimTranscript={recording.interimTranscript}
                    onStart={recording.startRecording}
                    onStop={recording.stopRecording}
                    onCancel={recording.cancelRecording}
                />
            </main>
            <AlertToast/>
        </div>
    );
}

function App() {
    return (
        <AlertProvider>
            <AppContent/>
        </AlertProvider>
    );
}

export default App;
