import { useState, useEffect, useCallback } from 'react';
import './App.css';
import { App as AppService } from '../bindings/mac-dictation';

type RecordingState = 'idle' | 'recording' | 'transcribing' | 'error';

function formatDuration(secs: number): string {
  const mins = Math.floor(secs / 60);
  const remainingSecs = Math.floor(secs % 60);
  return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
}

function App() {
  const [state, setState] = useState<RecordingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [provider, setProvider] = useState('');
  const [durationSecs, setDurationSecs] = useState(0);

  useEffect(() => {
    if (state !== 'recording') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const status = await AppService.GetRecordingStatus();
        setDurationSecs(status.duration_secs);
      } catch (e) {
        console.error('Failed to get recording status:', e);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [state]);

  const start = useCallback(async () => {
    try {
      setError(null);
      setTranscript('');
      setProvider('');
      setDurationSecs(0);
      setState('recording');
      await AppService.StartRecording();
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setError(errorMessage);
      setState('error');
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      setState('transcribing');
      const result = await AppService.StopRecording();
      if (result) {
        setTranscript(result.text);
        setProvider(result.provider);
      }
      setState('idle');
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setError(errorMessage);
      setState('error');
    }
  }, []);

  const cancel = useCallback(async () => {
    try {
      await AppService.CancelRecording();
      setState('idle');
      setDurationSecs(0);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setError(errorMessage);
      setState('error');
    }
  }, []);

  const clear = useCallback(() => {
    setTranscript('');
    setProvider('');
    setError(null);
    setDurationSecs(0);
    if (state === 'error') {
      setState('idle');
    }
  }, [state]);

  const isRecording = state === 'recording';
  const isTranscribing = state === 'transcribing';

  return (
    <div className="overflow-hidden duration-200">
      <div className="backdrop-blur-md p-4">
        {/* Header with drag handle */}
        <div className="drag-handle flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {isRecording && (
              <>
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs text-white/60">
                  {formatDuration(durationSecs)}
                </span>
              </>
            )}
            {isTranscribing && (
              <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
            )}
          </div>
          <span className="text-xs text-white/40">Deepgram</span>
        </div>

        <div className="min-h-[60px] max-h-[100px] overflow-y-auto mb-3">
          {error && (
              <p className="text-xs text-red-400">{error}</p>
          )}

          {isTranscribing && (
              <p className="text-xs text-white/40">Transcribing...</p>
          )}

          {transcript && (
              <div>
                <p className="text-sm text-white/90 leading-relaxed">
                  {transcript}
                </p>
                {provider && (
                    <p className="text-xs text-white/30 mt-1">
                      via {provider === 'deepgram' ? 'Deepgram' : provider}
                    </p>
                )}
              </div>
          )}

          {isRecording ? (
              <p className="text-xs text-white/40">Recording...</p>
          ) : (
              <p className="text-xs text-white/40">Ready to record</p>
          )}
        </div>

        <div className="flex items-center justify-center gap-2">
          {isRecording ? (
            <>
              <button
                className="no-drag btn btn-sm btn-error"
                onClick={stop}
              >
                Stop
              </button>
              <button
                className="no-drag btn btn-sm btn-ghost text-white/40"
                onClick={cancel}
              >
                Cancel
              </button>
            </>
          ) : isTranscribing ? (
            <button
              className="no-drag btn btn-sm btn-disabled"
              disabled
            >
              Processing...
            </button>
          ) : (
            <>
              <button
                className="no-drag btn btn-sm btn-primary"
                onClick={start}
              >
                Record
              </button>
              {(transcript || error) && (
                <button
                  className="no-drag btn btn-sm btn-ghost text-white/40"
                  onClick={clear}
                >
                  Clear
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
