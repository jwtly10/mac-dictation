import {LuMic, LuSquare, LuTrash2, LuX} from 'react-icons/lu';

interface Props {
    isRecording: boolean;
    isProcessing: boolean;
    hasContent: boolean;
    disabled?: boolean;
    onStart: () => void;
    onStop: () => void;
    onCancel: () => void;
    onClear: () => void;
}

export function RecordingControls({
                                      isRecording,
                                      isProcessing,
                                      hasContent,
                                      disabled = false,
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

    if (isProcessing) {
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
                disabled={disabled}
                className={`no-drag btn btn-sm gap-1.5 ${disabled ? 'btn-disabled' : 'btn-primary'}`}
                title={disabled ? 'Configure API keys in Settings to enable recording' : undefined}
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
