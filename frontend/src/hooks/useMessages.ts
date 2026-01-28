import { useCallback, useEffect, useState } from 'react'
import { Events } from '@wailsio/runtime'
import { App as AppService } from '../../bindings/mac-dictation'
import { Message } from '../../bindings/mac-dictation/internal/storage'
import { useAlerts } from '../contexts/AlertContext'

function parseMessageDates(message: Message): Message {
    return {
        ...message,
        createdAt: new Date(message.createdAt),
        updatedAt: new Date(message.updatedAt),
    }
}

interface TextImprovedEvent {
    messageId: number
    improvedText: string
}

export function useMessages(threadId: number | null) {
    const [messages, setMessages] = useState<Message[]>([])
    const [loading, setLoading] = useState(false)
    const { addAlert } = useAlerts()

    const fetchMessages = useCallback(
        async (id: number) => {
            setLoading(true)
            try {
                const result = await AppService.GetMessages(id)
                setMessages(result.map(parseMessageDates))
            } catch (err) {
                addAlert('error', `Failed to load messages: ${err}`)
                setMessages([])
            } finally {
                setLoading(false)
            }
        },
        [addAlert]
    )

    useEffect(() => {
        if (threadId === null) {
            setMessages([])
            return
        }
        fetchMessages(threadId)
    }, [threadId, fetchMessages])

    useEffect(() => {
        const unsub = Events.On(
            'message:text-improved',
            (ev: Events.WailsEvent) => {
                const data = ev.data as TextImprovedEvent
                setMessages((prev) =>
                    prev.map((msg) => {
                        if (msg.id === data.messageId) {
                            return { ...msg, text: data.improvedText }
                        }
                        return msg
                    })
                )
            }
        )
        return () => unsub()
    }, [])

    const addMessage = useCallback((message: Message) => {
        setMessages((prev) => [...prev, parseMessageDates(message)])
    }, [])

    const updateMessageText = useCallback((messageId: number, text: string) => {
        setMessages((prev) =>
            prev.map((msg) => {
                if (msg.id === messageId) {
                    return { ...msg, text }
                }
                return msg
            })
        )
    }, [])

    const clearMessages = useCallback(() => {
        setMessages([])
    }, [])

    return {
        messages,
        loading,
        addMessage,
        updateMessageText,
        clearMessages,
        refetch: threadId ? () => fetchMessages(threadId) : undefined,
    }
}
