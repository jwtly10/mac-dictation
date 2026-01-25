import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {LuCheck, LuMessageSquare, LuPin, LuPinOff, LuPlus, LuSettings, LuTrash2, LuX} from 'react-icons/lu';
import type {Thread} from '../types';

interface Props {
    threads: Thread[];
    activeThreadId: number | null;
    isOpen: boolean;
    width: number;
    onWidthChange: (width: number) => void;
    onToggle: () => void;
    onSelectThread: (threadId: number | null) => void;
    onNewThread: () => void;
    onDeleteThread: (threadId: number) => void;
    onSetThreadPinned: (threadId: number, pinned: boolean) => void;
    onOpenSettings: () => void;
}

const MIN_WIDTH = 180;
const MAX_WIDTH = 400;

function getWeekKey(date: Date): string {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor((startOfToday.getTime() - startOfDate.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'future';
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return 'this-week';
    if (diffDays < 14) return 'last-week';
    if (diffDays < 30) return 'this-month';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getWeekLabel(key: string): string {
    switch (key) {
        case 'future':
            return 'Upcoming';
        case 'today':
            return 'Today';
        case 'yesterday':
            return 'Yesterday';
        case 'this-week':
            return 'This Week';
        case 'last-week':
            return 'Last Week';
        case 'this-month':
            return 'This Month';
        default: {
            const [year, month] = key.split('-');
            const date = new Date(parseInt(year), parseInt(month) - 1);
            return date.toLocaleDateString('en-GB', {month: 'long', year: 'numeric'});
        }
    }
}

interface ThreadGroup {
    key: string;
    label: string;
    threads: Thread[];
}

function groupThreadsByTime(threads: Thread[]): ThreadGroup[] {
    const groups = new Map<string, Thread[]>();

    for (const thread of threads) {
        const key = getWeekKey(thread.updatedAt);
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key)!.push(thread);
    }

    const order = ['future', 'today', 'yesterday', 'this-week', 'last-week', 'this-month'];

    return Array.from(groups.entries())
        .sort(([a], [b]) => {
            const aIndex = order.indexOf(a);
            const bIndex = order.indexOf(b);
            if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
            if (aIndex !== -1) return -1;
            if (bIndex !== -1) return 1;
            return b.localeCompare(a);
        })
        .map(([key, threads]) => ({
            key,
            label: getWeekLabel(key),
            threads,
        }));
}

function formatRelativeDate(date: Date): string {
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'});
}

interface ThreadItemProps {
    thread: Thread;
    isActive: boolean;
    onSelect: () => void;
    onDelete: () => void;
    onTogglePin: () => void;
}

function ThreadItem({thread, isActive, onSelect, onDelete, onTogglePin}: Readonly<ThreadItemProps>) {
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    const handleDeleteClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirmingDelete) {
            onDelete();
            setConfirmingDelete(false);
        } else {
            setConfirmingDelete(true);
            setTimeout(() => setConfirmingDelete(false), 3000);
        }
    };

    const handleCancelDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        setConfirmingDelete(false);
    };

    const handlePinClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onTogglePin();
    };

    return (
        <div className="group relative">
            <button
                onClick={onSelect}
                className={`no-drag w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                    isActive
                        ? 'bg-white/10 text-white/90'
                        : 'hover:bg-white/5 text-white/60 hover:text-white/80'
                }`}
            >
                <LuMessageSquare size={14} className="shrink-0 opacity-50"/>
                <div className="flex-1 min-w-0">
                    <div className="truncate">{thread.name}</div>
                    <div className="text-[10px] text-white/40">
                        {formatRelativeDate(thread.updatedAt)}
                    </div>
                </div>
            </button>
            {confirmingDelete ? (
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                    <button
                        onClick={handleDeleteClick}
                        className="no-drag p-1.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-all"
                        title="Confirm delete"
                    >
                        <LuCheck size={12}/>
                    </button>
                    <button
                        onClick={handleCancelDelete}
                        className="no-drag p-1.5 rounded hover:bg-white/10 text-white/40 transition-all"
                        title="Cancel"
                    >
                        <LuX size={12}/>
                    </button>
                </div>
            ) : (
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={handlePinClick}
                        className={`no-drag p-1 rounded hover:bg-white/10 transition-all ${
                            thread.pinned ? 'text-amber-400' : 'text-white/40 hover:text-white/60'
                        }`}
                        title={thread.pinned ? 'Unpin thread' : 'Pin thread'}
                    >
                        {thread.pinned ? <LuPinOff size={12}/> : <LuPin size={12}/>}
                    </button>
                    <button
                        onClick={handleDeleteClick}
                        className="no-drag p-1 rounded hover:bg-white/10 text-white/40 hover:text-red-400 transition-all"
                        title="Delete thread"
                    >
                        <LuTrash2 size={12}/>
                    </button>
                </div>
            )}
        </div>
    );
}

export function Sidebar({
                            threads,
                            activeThreadId,
                            isOpen,
                            width,
                            onWidthChange,
                            onToggle,
                            onSelectThread,
                            onNewThread,
                            onDeleteThread,
                            onSetThreadPinned,
                            onOpenSettings,
                        }: Readonly<Props>) {
    const pinnedThreads = useMemo(() => threads.filter(t => t.pinned), [threads]);
    const unpinnedThreads = useMemo(() => threads.filter(t => !t.pinned), [threads]);
    const groupedThreads = useMemo(() => groupThreadsByTime(unpinnedThreads), [unpinnedThreads]);
    const isResizing = useRef(false);
    const sidebarRef = useRef<HTMLDivElement>(null);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isResizing.current = true;
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
    }, []);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing.current) return;
            const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
            onWidthChange(newWidth);
        };

        const handleMouseUp = () => {
            if (isResizing.current) {
                isResizing.current = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [onWidthChange]);

    return (
        <>
            <div
                ref={sidebarRef}
                style={{width: `${width}px`}}
                className={`absolute inset-y-0 left-0 z-10 bg-black/80 backdrop-blur-xl border-r border-white/10 flex flex-col transition-transform duration-200 ease-out ${
                    isOpen ? 'translate-x-0' : '-translate-x-full'
                }`}
            >
                <div className="h-11 shrink-0 border-b border-white/5"/>

                <div className="px-2 pb-2">
                    <button
                        onClick={onNewThread}
                        className="no-drag w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white/90 text-sm transition-colors"
                    >
                        <LuPlus size={14}/>
                        New Thread
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-2">
                    {pinnedThreads.length > 0 && (
                        <div>
                            <div className="px-3 py-2 text-[10px] font-medium text-amber-400/60 uppercase tracking-wider flex items-center gap-1.5">
                                <LuPin size={10}/>
                                Pinned
                            </div>
                            {pinnedThreads.map((thread) => (
                                <ThreadItem
                                    key={thread.id}
                                    thread={thread}
                                    isActive={activeThreadId === thread.id}
                                    onSelect={() => onSelectThread(thread.id)}
                                    onDelete={() => onDeleteThread(thread.id!)}
                                    onTogglePin={() => onSetThreadPinned(thread.id!, false)}
                                />
                            ))}
                        </div>
                    )}
                    {groupedThreads.map((group) => (
                        <div key={group.key}>
                            <div className="px-3 py-2 text-[10px] font-medium text-white/30 uppercase tracking-wider">
                                {group.label}
                            </div>
                            {group.threads.map((thread) => (
                                <ThreadItem
                                    key={thread.id}
                                    thread={thread}
                                    isActive={activeThreadId === thread.id}
                                    onSelect={() => onSelectThread(thread.id)}
                                    onDelete={() => onDeleteThread(thread.id!)}
                                    onTogglePin={() => onSetThreadPinned(thread.id!, true)}
                                />
                            ))}
                        </div>
                    ))}
                </div>

                <div className="shrink-0 px-2 py-2 border-t border-white/5">
                    <button
                        onClick={onOpenSettings}
                        className="no-drag w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 text-white/50 hover:text-white/70 text-sm transition-colors"
                    >
                        <LuSettings size={14}/>
                        Settings
                    </button>
                </div>

                <div
                    onMouseDown={handleMouseDown}
                    className="no-drag absolute top-0 right-0 w-1 h-full cursor-ew-resize hover:bg-white/20 transition-colors"
                />
            </div>

            {isOpen && (
                <div
                    className="absolute inset-0 bg-black/20"
                    onClick={onToggle}
                />
            )}
        </>
    );
}
