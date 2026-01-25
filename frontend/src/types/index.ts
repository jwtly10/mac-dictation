import type {Message, Thread} from "../../bindings/mac-dictation/internal/storage";

export type {Message, Thread} from "../../bindings/mac-dictation/internal/storage";

export type RecordingState = 'idle' | 'recording' | 'transcribing' | 'error';

export interface TranscriptionCompletedEvent {
    message: Message;
    thread: Thread | null;
    isNewThread: boolean;
}
