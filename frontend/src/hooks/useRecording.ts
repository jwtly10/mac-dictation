import {useCallback, useEffect, useRef, useState} from 'react';
import {Events} from '@wailsio/runtime';
import {App as AppService} from '../../bindings/mac-dictation';
import {config} from '../config';
import type {RecordingState, TranscriptionCompletedEvent} from '../types';

async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

interface UseRecordingOptions {
    onTranscriptionComplete?: (event: TranscriptionCompletedEvent) => void;
}

export function useRecording(options: UseRecordingOptions = {}) {
    const [state, setState] = useState<RecordingState>('idle');
    const [error, setError] = useState<string | null>(null);
    const [durationSecs, setDurationSecs] = useState(0);
    const [copied, setCopied] = useState(false);
    const [lastTranscript, setLastTranscript] = useState('');
    const copyTimeoutRef = useRef<number | null>(null);
    const optionsRef = useRef(options);

    useEffect(() => {
        optionsRef.current = options;
    }, [options]);

    useEffect(() => {
        const unsubs = [
            Events.On('recording:started', () => {
                setState('recording');
                setError(null);
                setDurationSecs(0);
                setCopied(false);
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
                const data = ev.data as TranscriptionCompletedEvent;
                setState('idle');

                const text = data.message.text || data.message.originalText;
                setLastTranscript(text);

                if (config.autoCopyOnTranscription && text) {
                    copyToClipboard(text);
                    setCopied(true);
                    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
                    copyTimeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
                }

                optionsRef.current.onTranscriptionComplete?.(data);
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
    }, []);

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
