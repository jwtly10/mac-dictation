import {useState, useCallback, useMemo} from 'react';
import {useRecording} from './hooks/useRecording';
import {useThreads} from './hooks/useThreads';
import {Sidebar, ChatView, TitleBar, ThreadHeader} from './components';

function App() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(224);
    const threads = useThreads();

    const recordingOptions = useMemo(() => ({
        onTranscriptionComplete: threads.addMessage,
    }), [threads.addMessage]);

    const recording = useRecording(recordingOptions);

    const handleNewThread = useCallback(() => {
        threads.createThread();
        setSidebarOpen(false);
    }, [threads]);

    const handleSelectThread = useCallback((threadId: string | null) => {
        threads.selectThread(threadId);
        setSidebarOpen(false);
    }, [threads]);

    const handleStartRecording = useCallback(() => {
        if (!threads.activeThreadId) {
            threads.createThread();
        }
        recording.startRecording();
    }, [threads, recording]);

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
                    thread={threads.activeThread}
                    recordingState={recording.state}
                    durationSecs={recording.durationSecs}
                    onStart={handleStartRecording}
                    onStop={recording.stopRecording}
                    onCancel={recording.cancelRecording}
                />
            </main>
        </div>
    );
}

export default App;
