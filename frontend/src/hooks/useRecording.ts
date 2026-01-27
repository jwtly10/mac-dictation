import {useCallback, useEffect, useRef, useState} from 'react';
import {Events} from '@wailsio/runtime';
import {App as AppService} from '../../bindings/mac-dictation';
import {config} from '../config';
import type {TranscriptionCompletedEvent} from '../types';

type RecordingState = 'idle' | 'recording' | 'processing';

interface InterimTranscript {
    text: string;
    isFinal: boolean;
}

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
    const [durationSecs, setDurationSecs] = useState(0);
    const [copied, setCopied] = useState(false);
    const [lastTranscript, setLastTranscript] = useState('');
    const [interimTranscript, setInterimTranscript] = useState('');
    const finalizedTextRef = useRef('');
    const copyTimeoutRef = useRef<number | null>(null);
    const optionsRef = useRef(options);

    useEffect(() => {
        optionsRef.current = options;
    }, [options]);

    useEffect(() => {
        const unsubs = [
            Events.On('recording:started', () => {
                setState('recording');
                setDurationSecs(0);
                setCopied(false);
                setInterimTranscript('');
                finalizedTextRef.current = '';
            }),
            Events.On('recording:progress', (ev: Events.WailsEvent) => {
                setDurationSecs(ev.data as number);
            }),
            Events.On('recording:stopped', () => {
                setState((current) => current === 'recording' ? 'processing' : current);
            }),
            Events.On('transcription:interim', (ev: Events.WailsEvent) => {
                const data = ev.data as InterimTranscript;
                if (data.isFinal) {
                    if (finalizedTextRef.current) {
                        finalizedTextRef.current += ' ' + data.text;
                    } else {
                        finalizedTextRef.current = data.text;
                    }
                    setInterimTranscript(finalizedTextRef.current);
                } else {
                    const display = finalizedTextRef.current
                        ? finalizedTextRef.current + ' ' + data.text
                        : data.text;
                    setInterimTranscript(display);
                }
            }),
            Events.On('transcription:processing', () => {
                setState('processing');
            }),
            Events.On('transcription:completed', (ev: Events.WailsEvent) => {
                const data = ev.data as TranscriptionCompletedEvent;
                setState('idle');
                setInterimTranscript('');
                finalizedTextRef.current = '';

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
        durationSecs,
        copied,
        lastTranscript,
        interimTranscript,
        startRecording,
        stopRecording,
        cancelRecording,
        hideWindow,
        handleCopy,
        isRecording: state === 'recording',
        isProcessing: state === 'processing',
        isBusy: state === 'recording' || state === 'processing',
    };
}
