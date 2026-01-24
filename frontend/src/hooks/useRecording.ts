import {useCallback, useEffect, useRef, useState} from 'react';
import {Events} from '@wailsio/runtime';
import {App as AppService} from '../../bindings/mac-dictation';
import {config} from '../config';
import type {Message, RecordingState, TranscriptionData} from '../types';

async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

interface UseRecordingOptions {
    onTranscriptionComplete?: (message: Omit<Message, 'id'>) => void;
}

export function useRecording(options: UseRecordingOptions = {}) {
    const [state, setState] = useState<RecordingState>('idle');
    const [error, setError] = useState<string | null>(null);
    const [durationSecs, setDurationSecs] = useState(0);
    const [copied, setCopied] = useState(false);
    const [lastTranscript, setLastTranscript] = useState('');
    const copyTimeoutRef = useRef<number | null>(null);
    const recordingStartTimeRef = useRef<Date | null>(null);

    useEffect(() => {
        const unsubs = [
            Events.On('recording:started', () => {
                setState('recording');
                setError(null);
                setDurationSecs(0);
                setCopied(false);
                recordingStartTimeRef.current = new Date();
            }),
            Events.On('recording:progress', (ev: Events.WailsEvent) => {
                setDurationSecs(ev.data as number);
            }),
            Events.On('recording:stopped', () => {
                setState((current) => current === 'recording' ? 'idle' : current);
            }),
            Events.On('transcription:started', () => {
                setState('transcribing');
            }),
            Events.On('transcription:completed', (ev: Events.WailsEvent) => {
                const data = ev.data as TranscriptionData;
                setState('idle');
                setLastTranscript(data.text);

                if (config.autoCopyOnTranscription && data.text) {
                    copyToClipboard(data.text);
                    setCopied(true);
                    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
                    copyTimeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
                }

                if (options.onTranscriptionComplete && data.text) {
                    options.onTranscriptionComplete({
                        text: data.text,
                        provider: data.provider,
                        timestamp: recordingStartTimeRef.current ?? new Date(),
                        durationSecs: Math.floor(durationSecs),
                    });
                }
            }),
            Events.On('error', (ev: Events.WailsEvent) => {
                setError(ev.data as string);
                setState('error');
            }),
        ];

        return () => {
            unsubs.forEach(fn => fn());
            if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
        };
    }, [durationSecs, options]);

    const startRecording = useCallback(() => AppService.StartRecording(), []);
    const stopRecording = useCallback(() => AppService.StopRecording(), []);
    const cancelRecording = useCallback(() => AppService.CancelRecording(), []);
    const hideWindow = useCallback(() => AppService.HideWindow(), []);

    const handleCopy = useCallback(async () => {
        if (!lastTranscript) return;
        const success = await copyToClipboard(lastTranscript);
        if (success) {
            setCopied(true);
            if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
            copyTimeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
        }
    }, [lastTranscript]);

    return {
        state,
        error,
        durationSecs,
        copied,
        lastTranscript,
        startRecording,
        stopRecording,
        cancelRecording,
        hideWindow,
        handleCopy,
        isRecording: state === 'recording',
        isTranscribing: state === 'transcribing',
        isBusy: state === 'recording' || state === 'transcribing',
    };
}
