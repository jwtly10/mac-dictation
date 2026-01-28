import { useCallback, useEffect, useState } from 'react'
import { Events } from '@wailsio/runtime'
import { App as AppService } from '../../bindings/mac-dictation'
import { useAlerts } from '../contexts/AlertContext'
import type { Thread } from '../types'

function parseThreadDates(thread: Thread): Thread {
    return {
        ...thread,
        createdAt: new Date(thread.createdAt),
        updatedAt: new Date(thread.updatedAt),
    }
}

interface TitleGeneratedEvent {
    threadId: number
    title: string
}

export function useThreads() {
    const [threads, setThreads] = useState<Thread[]>([])
    const [activeThreadId, setActiveThreadId] = useState<number | null>(null)
    const [generatingTitleFor, setGeneratingTitleFor] = useState<number | null>(
        null
    )
    const [loading, setLoading] = useState(true)
    const { addAlert } = useAlerts()

    const activeThread = threads.find((t) => t.id === activeThreadId) ?? null

    const fetchThreads = useCallback(async () => {
        setLoading(true)
        try {
            const result = await AppService.GetThreads()
            setThreads(result.map(parseThreadDates))
        } catch (err) {
            addAlert('error', `Failed to load threads: ${err}`)
            setThreads([])
        } finally {
            setLoading(false)
        }
    }, [addAlert])

    useEffect(() => {
        fetchThreads()
    }, [fetchThreads])

    useEffect(() => {
        const unsub = Events.On(
            'thread:title-generated',
            (ev: Events.WailsEvent) => {
                const data = ev.data as TitleGeneratedEvent
                setThreads((prev) =>
                    prev.map((thread) => {
                        if (thread.id === data.threadId) {
                            return { ...thread, name: data.title }
                        }
                        return thread
                    })
                )
                setGeneratingTitleFor(null)
            }
        )
        return () => unsub()
    }, [])

    const selectThread = useCallback((threadId: number | null) => {
        setActiveThreadId(threadId)
        AppService.SelectThread(threadId ?? 0)
    }, [])

    const addThread = useCallback((thread: Thread) => {
        const parsed = parseThreadDates(thread)
        setThreads((prev) => [parsed, ...prev])
        setActiveThreadId(parsed.id)
        if (parsed.name === 'Untitled Chat' && parsed.id) {
            setGeneratingTitleFor(parsed.id)
        }
    }, [])

    const updateThread = useCallback((thread: Thread) => {
        const parsed = parseThreadDates(thread)
        setThreads((prev) => {
            const filtered = prev.filter((t) => t.id !== parsed.id)
            return [parsed, ...filtered]
        })
    }, [])

    const deleteThread = useCallback(
        async (threadId: number) => {
            try {
                await AppService.DeleteThread(threadId)
                setThreads((prev) => prev.filter((t) => t.id !== threadId))
                if (activeThreadId === threadId) {
                    setActiveThreadId(null)
                }
            } catch (err) {
                addAlert('error', `Failed to delete thread: ${err}`)
            }
        },
        [activeThreadId, addAlert]
    )

    const renameThread = useCallback(
        async (threadId: number, newName: string) => {
            try {
                await AppService.RenameThread(threadId, newName)
                setThreads((prev) =>
                    prev.map((thread) => {
                        if (thread.id === threadId) {
                            return {
                                ...thread,
                                name: newName,
                                updatedAt: new Date(),
                            }
                        }
                        return thread
                    })
                )
            } catch (err) {
                addAlert('error', `Failed to rename thread: ${err}`)
            }
        },
        [addAlert]
    )

    const setThreadPinned = useCallback(
        async (threadId: number, pinned: boolean) => {
            try {
                await AppService.SetThreadPinned(threadId, pinned)
                setThreads((prev) =>
                    prev.map((thread) => {
                        if (thread.id === threadId) {
                            return { ...thread, pinned, updatedAt: new Date() }
                        }
                        return thread
                    })
                )
            } catch (err) {
                addAlert(
                    'error',
                    `Failed to ${pinned ? 'pin' : 'unpin'} thread: ${err}`
                )
            }
        },
        [addAlert]
    )

    return {
        threads,
        activeThread,
        activeThreadId,
        generatingTitleFor,
        loading,
        selectThread,
        addThread,
        updateThread,
        deleteThread,
        renameThread,
        setThreadPinned,
        refetch: fetchThreads,
    }
}
