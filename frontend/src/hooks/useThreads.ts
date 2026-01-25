import {useCallback, useEffect, useState} from 'react';
import {App as AppService} from '../../bindings/mac-dictation';
import type {Thread} from '../types';

function parseThreadDates(thread: Thread): Thread {
    return {
        ...thread,
        createdAt: new Date(thread.createdAt),
        updatedAt: new Date(thread.updatedAt),
    };
}

export function useThreads() {
    const [threads, setThreads] = useState<Thread[]>([]);
    const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);

    const activeThread = threads.find(t => t.id === activeThreadId) ?? null;

    const fetchThreads = useCallback(async () => {
        setLoading(true);
        try {
            const result = await AppService.GetThreads();
            setThreads(result.map(parseThreadDates));
        } catch {
            setThreads([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchThreads();
    }, [fetchThreads]);

    const selectThread = useCallback((threadId: number | null) => {
        setActiveThreadId(threadId);
        AppService.SelectThread(threadId ?? 0);
    }, []);

    const addThread = useCallback((thread: Thread) => {
        const parsed = parseThreadDates(thread);
        setThreads(prev => [parsed, ...prev]);
        setActiveThreadId(parsed.id);
    }, []);

    const updateThread = useCallback((thread: Thread) => {
        const parsed = parseThreadDates(thread);
        setThreads(prev => {
            const filtered = prev.filter(t => t.id !== parsed.id);
            return [parsed, ...filtered];
        });
    }, []);

    const deleteThread = useCallback(async (threadId: number) => {
        try {
            await AppService.DeleteThread(threadId);
            setThreads(prev => prev.filter(t => t.id !== threadId));
            if (activeThreadId === threadId) {
                setActiveThreadId(null);
            }
        } catch {
        }
    }, [activeThreadId]);

    const renameThread = useCallback(async (threadId: number, newName: string) => {
        try {
            await AppService.RenameThread(threadId, newName);
            setThreads(prev => prev.map(thread => {
                if (thread.id === threadId) {
                    return {...thread, name: newName, updatedAt: new Date()};
                }
                return thread;
            }));
        } catch {
        }
    }, []);

    const setThreadPinned = useCallback(async (threadId: number, pinned: boolean) => {
        try {
            await AppService.SetThreadPinned(threadId, pinned);
            setThreads(prev => prev.map(thread => {
                if (thread.id === threadId) {
                    return {...thread, pinned, updatedAt: new Date()};
                }
                return thread;
            }));
        } catch {
        }
    }, []);

    return {
        threads,
        activeThread,
        activeThreadId,
        loading,
        selectThread,
        addThread,
        updateThread,
        deleteThread,
        renameThread,
        setThreadPinned,
        refetch: fetchThreads,
    };
}
