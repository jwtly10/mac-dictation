import type {RecordingState} from '../types';

interface Props {
    state: RecordingState;
    durationSecs: number;
}

function formatDuration(secs: number): string {
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
}

const STATUS_CONFIG: Record<RecordingState, { color?: string; text: string }> = {
    idle: {text: 'Ready'},
    recording: {color: 'bg-red-500', text: 'Recording'},
    transcribing: {color: 'bg-amber-400', text: 'Transcribing'},
    error: {color: 'bg-red-500', text: 'Error'},
};

export function StatusIndicator({state, durationSecs}: Readonly<Props>) {
    const config = STATUS_CONFIG[state];
    const isRecording = state === 'recording';

    return (
        <div className="flex items-center gap-2">
            {config.color && (
                <span className="relative flex h-2 w-2">
                    <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${config.color}`}/>
                    <span className={`relative inline-flex h-2 w-2 rounded-full ${config.color}`}/>
                </span>
            )}
            <span className="text-xs font-medium text-white/60">
                {config.text}
                {isRecording && (
                    <span className="ml-1 font-mono text-white/40">
                        {formatDuration(durationSecs)}
                    </span>
                )}
            </span>
        </div>
    );
}
