import type {RecordingState} from '../types';

const MAX_TRANSCRIPTION_SECS = 7 * 60;
const WARNING_THRESHOLD_SECS = 6 * 60;

interface Props {
    state: RecordingState;
    durationSecs: number;
}

function formatDuration(secs: number): string {
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
}

export function StatusIndicator({state, durationSecs}: Readonly<Props>) {
    const isRecording = state === 'recording';
    const isProcessing = state === 'processing';
    const isApproachingLimit = isRecording && durationSecs >= WARNING_THRESHOLD_SECS;
    const isOverLimit = isRecording && durationSecs >= MAX_TRANSCRIPTION_SECS;

    const getStatusText = () => {
        if (isOverLimit) return 'Limit reached';
        if (isApproachingLimit) return 'Approaching limit';
        if (isRecording) return 'Recording';
        if (isProcessing) return 'Processing';
        return 'Ready';
    };

    const getDotColor = () => {
        if (isOverLimit) return 'bg-red-500';
        if (isApproachingLimit) return 'bg-amber-400';
        if (isRecording) return 'bg-red-500';
        if (isProcessing) return 'bg-amber-400';
        return undefined;
    };

    const dotColor = getDotColor();

    return (
        <div className="flex items-center gap-2">
            {dotColor && (
                <span className="relative flex h-2 w-2">
                    <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${dotColor}`}/>
                    <span className={`relative inline-flex h-2 w-2 rounded-full ${dotColor}`}/>
                </span>
            )}
            <span className={`text-xs font-medium ${isOverLimit ? 'text-amber-400' : isApproachingLimit ? 'text-amber-400/80' : 'text-white/60'}`}>
                {getStatusText()}
                {isRecording && (
                    <span className={`ml-1 font-mono ${isOverLimit ? 'text-amber-400/70' : isApproachingLimit ? 'text-amber-400/60' : 'text-white/40'}`}>
                        {formatDuration(durationSecs)}
                    </span>
                )}
            </span>
        </div>
    );
}
