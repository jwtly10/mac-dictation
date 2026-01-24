import {LuMic, LuSquare, LuTrash2, LuX} from 'react-icons/lu';

interface Props {
    isRecording: boolean;
    isTranscribing: boolean;
    hasContent: boolean;
    onStart: () => void;
    onStop: () => void;
    onCancel: () => void;
    onClear: () => void;
}

export function RecordingControls({
                                      isRecording,
                                      isTranscribing,
                                      hasContent,
                                      onStart,
                                      onStop,
                                      onCancel,
                                      onClear,
                                  }: Readonly<Props>) {
    if (isRecording) {
        return (
            <div className="flex items-center gap-2">
                <button
                    onClick={onStop}
                    className="no-drag btn btn-sm btn-error gap-1.5"
                >
                    <LuSquare size={14}/>
                    Stop
                </button>
                <button
                    onClick={onCancel}
                    className="no-drag btn btn-sm btn-ghost text-white/40 gap-1.5"
                >
                    <LuX size={14}/>
                    Cancel
                </button>
            </div>
        );
    }

    if (isTranscribing) {
        return (
            <button className="no-drag btn btn-sm btn-disabled" disabled>
                <span className="loading loading-spinner loading-xs"/>{' '}
                Processing
            </button>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <button
                onClick={onStart}
                className="no-drag btn btn-sm btn-primary gap-1.5"
            >
                <LuMic size={14}/>
                Record
            </button>
            {hasContent && (
                <button
                    onClick={onClear}
                    className="no-drag btn btn-sm btn-ghost text-white/40 gap-1.5"
                >
                    <LuTrash2 size={14}/>
                    Clear
                </button>
            )}
        </div>
    );
}
