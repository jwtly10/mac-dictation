import {useState, useCallback, useMemo} from 'react';
import {useRecording} from './hooks/useRecording';
import {useThreads} from './hooks/useThreads';
import {useMessages} from './hooks/useMessages';
import {Sidebar, ChatView, TitleBar, ThreadHeader} from './components';
import type {TranscriptionCompletedEvent} from './types';

function App() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(224);

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

    return (
        <div className="h-screen flex flex-col bg-black/50 backdrop-blur-xl overflow-hidden relative">
            <Sidebar
                threads={threads.threads}
                activeThreadId={threads.activeThreadId}
                isOpen={sidebarOpen}
                width={sidebarWidth}
                onWidthChange={setSidebarWidth}
                onToggle={() => setSidebarOpen(!sidebarOpen)}
                onSelectThread={handleSelectThread}
                onNewThread={handleNewThread}
                onDeleteThread={threads.deleteThread}
            />

            <TitleBar onHide={recording.hideWindow}/>

            <ThreadHeader
                title={threads.activeThread?.name ?? 'New Thread'}
                hasTranscript={!!recording.lastTranscript}
                copied={recording.copied}
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
                    onStart={recording.startRecording}
                    onStop={recording.stopRecording}
                    onCancel={recording.cancelRecording}
                />
            </main>
        </div>
    );
}

export default App;
