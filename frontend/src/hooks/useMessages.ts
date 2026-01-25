import {useCallback, useEffect, useState} from 'react';
import {App as AppService} from '../../bindings/mac-dictation';
import {Message} from "../../bindings/mac-dictation/internal/storage";
import {useAlerts} from '../contexts/AlertContext';

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
    const {addAlert} = useAlerts();

    const fetchMessages = useCallback(async (id: number) => {
        setLoading(true);
        try {
            const result = await AppService.GetMessages(id);
            setMessages(result.map(parseMessageDates));
        } catch (err) {
            addAlert('error', `Failed to load messages: ${err}`);
            setMessages([]);
        } finally {
            setLoading(false);
        }
    }, [addAlert]);

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
        addMessage,
        clearMessages,
        refetch: threadId ? () => fetchMessages(threadId) : undefined,
    };
}
