export type RecordingState = 'idle' | 'recording' | 'transcribing' | 'error';

export interface TranscriptionData {
    text: string;
    provider: string;
}

export interface Message {
    id: string;
    text: string;
    provider: string;
    timestamp: Date;
    durationSecs: number;
}

export interface Thread {
    id?: string;
    name: string;
    createdAt?: Date;
    updatedAt?: Date;
    messages: Message[];
}
