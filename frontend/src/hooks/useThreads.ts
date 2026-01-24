import {useCallback, useState} from 'react';
import type {Message, Thread} from '../types';

function daysAgo(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
}

const MOCK_THREADS: Thread[] = [
    {
        id: '1',
        name: 'Morning standup notes',
        createdAt: daysAgo(0),
        updatedAt: daysAgo(0),
        messages: [
            {id: '1', text: 'Team is on track for the sprint. No blockers reported. Alice will finish the API integration today.', provider: 'deepgram', timestamp: daysAgo(0), durationSecs: 45},
        ],
    },
    {
        id: '2',
        name: 'Quick reminder about dentist',
        createdAt: daysAgo(1),
        updatedAt: daysAgo(1),
        messages: [
            {id: '1', text: 'Dentist appointment next Thursday at 2pm. Need to reschedule the client call.', provider: 'deepgram', timestamp: daysAgo(1), durationSecs: 15},
        ],
    },
    {
        id: '3',
        name: 'Product feedback session',
        createdAt: daysAgo(3),
        updatedAt: daysAgo(3),
        messages: [
            {id: '1', text: 'Users love the new dark mode but want more customization options. Consider adding accent color picker.', provider: 'deepgram', timestamp: daysAgo(3), durationSecs: 60},
            {id: '2', text: 'Mobile app performance needs improvement. Loading times are too slow on older devices.', provider: 'deepgram', timestamp: daysAgo(3), durationSecs: 45},
        ],
    },
    {
        id: '4',
        name: 'Weekly planning',
        createdAt: daysAgo(5),
        updatedAt: daysAgo(4),
        messages: [
            {id: '1', text: 'Priorities for this week: finish onboarding flow, fix payment bugs, start work on notifications.', provider: 'deepgram', timestamp: daysAgo(5), durationSecs: 30},
        ],
    },
    {
        id: '5',
        name: 'Client call with Acme Corp',
        createdAt: daysAgo(8),
        updatedAt: daysAgo(8),
        messages: [
            {id: '1', text: 'They want to increase their plan to enterprise. Need to send proposal by Friday.', provider: 'deepgram', timestamp: daysAgo(8), durationSecs: 120},
        ],
    },
    {
        id: '6',
        name: 'Architecture discussion',
        createdAt: daysAgo(10),
        updatedAt: daysAgo(9),
        messages: [
            {id: '1', text: 'Decided to move to microservices for the payment system. Will reduce coupling and improve scalability.', provider: 'deepgram', timestamp: daysAgo(10), durationSecs: 90},
        ],
    },
    {
        id: '7',
        name: 'Interview notes - Senior Dev',
        createdAt: daysAgo(15),
        updatedAt: daysAgo(15),
        messages: [
            {id: '1', text: 'Strong candidate. 8 years experience, good system design skills. Seems like a culture fit.', provider: 'deepgram', timestamp: daysAgo(15), durationSecs: 40},
        ],
    },
    {
        id: '8',
        name: 'December retrospective',
        createdAt: daysAgo(45),
        updatedAt: daysAgo(45),
        messages: [
            {id: '1', text: 'Good velocity this month. Shipped 3 major features. Need to improve test coverage next quarter.', provider: 'deepgram', timestamp: daysAgo(45), durationSecs: 55},
        ],
    },
];

function generateId(): string {
    return Math.random().toString(36).substring(2, 9);
}

function createNewThread(): Thread {
    return {
        id: generateId(),
        name: 'New Thread',
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [],
    };
}

export function useThreads() {
    const [threads, setThreads] = useState<Thread[]>(MOCK_THREADS);
    const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

    const activeThread = threads.find(t => t.id === activeThreadId) ?? null;

    const createThread = useCallback(() => {
        const newThread = createNewThread();
        setThreads(prev => [newThread, ...prev]);
        setActiveThreadId(newThread.id ?? null);
        return newThread;
    }, []);

    const selectThread = useCallback((threadId: string | null) => {
        setActiveThreadId(threadId);
    }, []);

    const addMessage = useCallback((message: Omit<Message, 'id'>) => {
        let targetThreadId: string | null = activeThreadId;

        if (!targetThreadId) {
            const newThread = createNewThread();
            setThreads(prev => [newThread, ...prev]);
            targetThreadId = newThread.id ?? null;
            setActiveThreadId(targetThreadId);
        }

        const newMessage: Message = {
            ...message,
            id: generateId(),
        };

        setThreads(prev => prev.map(thread => {
            if (thread.id === targetThreadId) {
                const updatedName = thread.messages.length === 0
                    ? message.text.slice(0, 30) + (message.text.length > 30 ? '...' : '')
                    : thread.name;
                return {
                    ...thread,
                    name: updatedName,
                    updatedAt: new Date(),
                    messages: [...thread.messages, newMessage],
                };
            }
            return thread;
        }));

        return newMessage;
    }, [activeThreadId]);

    const deleteThread = useCallback((threadId: string) => {
        setThreads(prev => prev.filter(t => t.id !== threadId));
        if (activeThreadId === threadId) {
            setActiveThreadId(null);
        }
    }, [activeThreadId]);

    const renameThread = useCallback((threadId: string, newName: string) => {
        setThreads(prev => prev.map(thread => {
            if (thread.id === threadId) {
                return {...thread, name: newName};
            }
            return thread;
        }));
    }, []);

    return {
        threads,
        activeThread,
        activeThreadId,
        createThread,
        selectThread,
        addMessage,
        deleteThread,
        renameThread,
    };
}
