import {useCallback, useEffect, useState} from 'react';
import {Events} from '@wailsio/runtime';
import {App as AppService} from '../bindings/mac-dictation';

type RecordingState = 'idle' | 'recording' | 'transcribing' | 'error';

interface TranscriptionData {
    text: string;
    provider: string;
}

function formatDuration(secs: number): string {
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
}

const STATUS_CONFIG: Record<RecordingState, { dot?: string; text: string }> = {
    idle: {text: 'Ready'},
    recording: {dot: 'bg-red-500', text: 'Recording'},
    transcribing: {dot: 'bg-yellow-500', text: 'Transcribing'},
    error: {dot: 'bg-red-500', text: 'Error'},
};

function App() {
    const [state, setState] = useState<RecordingState>('idle');
    const [error, setError] = useState<string | null>(null);
    const [transcript, setTranscript] = useState('');
    const [provider, setProvider] = useState('');
    const [durationSecs, setDurationSecs] = useState(0);

    useEffect(() => {
        const unsubs = [
            Events.On('recording:started', () => {
                setState('recording');
                setError(null);
                setTranscript('');
                setDurationSecs(0);
            }),
            Events.On('recording:progress', (ev: Events.WailsEvent) => {
                setDurationSecs(ev.data as number);
            }),
            Events.On('recording:stopped', () => {
            }),
            Events.On('transcription:started', () => {
                setState('transcribing');
            }),
            Events.On('transcription:completed', (ev: Events.WailsEvent) => {
                const data = ev.data as TranscriptionData;
                setTranscript(data.text);
                setProvider(data.provider);
                setState('idle');
            }),
            Events.On('error', (ev: Events.WailsEvent) => {
                setError(ev.data as string);
                setState('error');
            }),
        ];

        return () => unsubs.forEach(fn => fn());
    }, []);

    const start = useCallback(() => AppService.StartRecording(), []);
    const stop = useCallback(() => AppService.StopRecording(), []);
    const cancel = useCallback(() => AppService.CancelRecording(), []);
    const clear = useCallback(() => {
        setTranscript('');
        setProvider('');
        setError(null);
        if (state === 'error') setState('idle');
    }, [state]);

    const status = STATUS_CONFIG[state];
    const isRecording = state === 'recording';
    const isTranscribing = state === 'transcribing';
    const isBusy = isRecording || isTranscribing;
    const hasContent = transcript || error;

    return (
        <div className="backdrop-blur-md p-4">
            {/* Header */}
            <div className="drag-handle flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    {status.dot && (
                        <div className={`w-2 h-2 rounded-full animate-pulse ${status.dot}`}/>
                    )}
                    <span className="text-xs text-white/60">
                        {status.text}
                        {isRecording && ` ${formatDuration(durationSecs)}`}
                    </span>
                </div>
                {provider && (
                    <span className="text-xs text-white/40">{provider}</span>
                )}
            </div>

            {/* Content */}
            <div className="min-h-[60px] max-h-[100px] overflow-y-auto mb-3 text-sm">
                {error && <p className="text-red-400">{error}</p>}
                {transcript && (
                    <p className="text-white/90 leading-relaxed">{transcript}</p>
                )}
                {!hasContent && !isBusy && (
                    <p className="text-white/40 text-xs">Press Record to start</p>
                )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-center gap-2">
                {isRecording ? (
                    <>
                        <button className="no-drag btn btn-sm btn-error" onClick={stop}>
                            Stop
                        </button>
                        <button className="no-drag btn btn-sm btn-ghost text-white/40" onClick={cancel}>
                            Cancel
                        </button>
                    </>
                ) : isTranscribing ? (
                    <button className="no-drag btn btn-sm loading" disabled>
                        Processing
                    </button>
                ) : (
                    <>
                        <button className="no-drag btn btn-sm btn-primary" onClick={start}>
                            Record
                        </button>
                        {hasContent && (
                            <button className="no-drag btn btn-sm btn-ghost text-white/40" onClick={clear}>
                                Clear
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export default App;
