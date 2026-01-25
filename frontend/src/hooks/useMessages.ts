import {useCallback, useEffect, useState} from 'react';
import {App as AppService} from '../../bindings/mac-dictation';
import {Message} from "../../bindings/mac-dictation/internal/storage";

function parseMessageDates(message: Message): Message {
    return {
        ...message,
        createdAt: new Date(message.createdAt),
        updatedAt: new Date(message.updatedAt),
    };
}

export function useMessages(threadId: number | null) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchMessages = useCallback(async (id: number) => {
        setLoading(true);
        setError(null);
        try {
            const result = await AppService.GetMessages(id);
            setMessages(result.map(parseMessageDates));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load messages');
            setMessages([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (threadId === null) {
            setMessages([]);
            return;
        }
        fetchMessages(threadId);
    }, [threadId, fetchMessages]);

    const addMessage = useCallback((message: Message) => {
        setMessages(prev => [...prev, parseMessageDates(message)]);
    }, []);

    const clearMessages = useCallback(() => {
        setMessages([]);
    }, []);

    return {
        messages,
        loading,
        error,
        addMessage,
        clearMessages,
        refetch: threadId ? () => fetchMessages(threadId) : undefined,
    };
}
