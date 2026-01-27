import {useEffect, useMemo, useRef} from 'react';
import {MessageBubble} from './MessageBubble';
import {RecordingControls} from './RecordingControls';
import {StatusIndicator} from './StatusIndicator';
import type {Message, RecordingState} from '../types';

interface Props {
    messages: Message[];
    loading?: boolean;
    recordingState: RecordingState;
    durationSecs: number;
    recordingDisabled?: boolean;
    interimTranscript?: string;
    onStart: () => void;
    onStop: () => void;
    onCancel: () => void;
}

function formatDateKey(date: Date): string {
    return date.toISOString().split('T')[0];
}

function formatDateLabel(date: Date): string {
    const now = new Date();
    const today = formatDateKey(now);
    const yesterday = formatDateKey(new Date(now.getTime() - 86400000));
    const key = formatDateKey(date);

    if (key === today) return 'Today';
    if (key === yesterday) return 'Yesterday';

    return date.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
}

interface MessageGroup {
    dateKey: string;
    dateLabel: string;
    messages: Message[];
}

function groupMessagesByDate(messages: Message[]): MessageGroup[] {
    const groups: MessageGroup[] = [];
    let currentGroup: MessageGroup | null = null;

    for (const message of messages) {
        const dateKey = formatDateKey(message.createdAt);
        if (!currentGroup || currentGroup.dateKey !== dateKey) {
            currentGroup = {
                dateKey,
                dateLabel: formatDateLabel(message.createdAt),
                messages: [],
            };
            groups.push(currentGroup);
        }
        currentGroup.messages.push(message);
    }

    return groups;
}

export function ChatView({
                             messages,
                             loading = false,
                             recordingState,
                             durationSecs,
                             recordingDisabled = false,
                             interimTranscript = '',
                             onStart,
                             onStop,
                             onCancel,
                         }: Readonly<Props>) {
    const scrollRef = useRef<HTMLDivElement>(null);

    const messageGroups = useMemo(() => {
        if (!messages.length) return [];
        return groupMessagesByDate(messages);
    }, [messages]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages.length, interimTranscript]);

    const hasMessages = messageGroups.length > 0;
    const isRecording = recordingState === 'recording';
    const isProcessing = recordingState === 'processing';
    const showStatus = recordingState !== 'idle';
    const showInterim = (isRecording || isProcessing) && interimTranscript;

    return (
        <div className="flex flex-col h-full">
            <div ref={scrollRef} className="flex-1 overflow-y-auto py-2 no-drag">
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-white/30 text-sm">Loading...</div>
                    </div>
                ) : hasMessages ? (
                    <>
                        {messageGroups.map((group) => (
                            <div key={group.dateKey}>
                                <div className="flex items-center gap-3 px-4 py-3">
                                    <div className="flex-1 h-px bg-white/10"/>
                                    <span className="text-[10px] text-white/40 font-medium uppercase tracking-wider">
                                        {group.dateLabel}
                                    </span>
                                    <div className="flex-1 h-px bg-white/10"/>
                                </div>
                                {group.messages.map((message) => (
                                    <MessageBubble key={message.id} message={message}/>
                                ))}
                            </div>
                        ))}
                        {showInterim && (
                            <div className="px-4 py-2">
                                <div className={`bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/50 text-sm italic transition-all ${isProcessing ? 'animate-pulse' : ''}`}>
                                    {interimTranscript}
                                    {isProcessing && (
                                        <span className="inline-flex ml-1">
                                            <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                                            <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                                            <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                ) : showInterim ? (
                    <div className="px-4 py-2">
                        <div className={`bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/50 text-sm italic transition-all ${isProcessing ? 'animate-pulse' : ''}`}>
                            {interimTranscript}
                            {isProcessing && (
                                <span className="inline-flex ml-1">
                                    <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                                    <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                                    <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                                </span>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6">
                        <div className="text-white/10 text-sm">
                            Press record to begin with a new Thread
                        </div>
                    </div>
                )}
            </div>

            <div className="shrink-0 px-3 py-3 border-t border-white/5">
                <div className="flex items-center justify-center gap-3">
                    {showStatus && (
                        <StatusIndicator state={recordingState} durationSecs={durationSecs}/>
                    )}
                    <RecordingControls
                        isRecording={isRecording}
                        isProcessing={isProcessing}
                        hasContent={false}
                        disabled={recordingDisabled}
                        onStart={onStart}
                        onStop={onStop}
                        onCancel={onCancel}
                        onClear={() => {
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
