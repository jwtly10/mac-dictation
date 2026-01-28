import { useState, useCallback, useRef, useEffect } from 'react'
import { LuMenu, LuPencil, LuCheck, LuX, LuCopy } from 'react-icons/lu'

interface Props {
    title: string
    hasTranscript: boolean
    copied: boolean
    isGeneratingTitle?: boolean
    onToggleSidebar: () => void
    onTitleChange: (newTitle: string) => void
    onCopy: () => void
}

export function ThreadHeader({
    title,
    hasTranscript,
    copied,
    isGeneratingTitle = false,
    onToggleSidebar,
    onTitleChange,
    onCopy,
}: Readonly<Props>) {
    const [isEditing, setIsEditing] = useState(false)
    const [editValue, setEditValue] = useState(title)
    const [animatingTitle, setAnimatingTitle] = useState<string | null>(null)
    const [prevTitle, setPrevTitle] = useState(title)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (
            title !== prevTitle &&
            prevTitle === 'Untitled' &&
            title !== 'Untitled'
        ) {
            setAnimatingTitle(title)
            setPrevTitle(title)
        } else {
            setPrevTitle(title)
        }
    }, [title, prevTitle])

    useEffect(() => {
        if (animatingTitle) {
            const timeout = setTimeout(
                () => {
                    setAnimatingTitle(null)
                },
                animatingTitle.length * 50 + 500
            ) // 50ms per letter + buffer
            return () => clearTimeout(timeout)
        }
    }, [animatingTitle])

    useEffect(() => {
        setEditValue(title)
    }, [title])

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
        }
    }, [isEditing])

    const handleSave = useCallback(() => {
        const trimmed = editValue.trim()
        if (trimmed && trimmed !== title) {
            onTitleChange(trimmed)
        }
        setIsEditing(false)
    }, [editValue, title, onTitleChange])

    const handleCancel = useCallback(() => {
        setEditValue(title)
        setIsEditing(false)
    }, [title])

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter') {
                handleSave()
            } else if (e.key === 'Escape') {
                handleCancel()
            }
        },
        [handleSave, handleCancel]
    )

    return (
        <div className="flex items-center gap-2 px-2 py-2 shrink-0 border-b border-white/5">
            <button
                onClick={onToggleSidebar}
                className="no-drag p-1.5 rounded-md hover:bg-white/10 text-white/50 hover:text-white/80 transition-all shrink-0"
            >
                <LuMenu size={16} />
            </button>

            <div className="flex-1 min-w-0 flex items-center gap-1.5">
                {isEditing ? (
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                        <input
                            ref={inputRef}
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onBlur={handleSave}
                            className="no-drag flex-1 min-w-0 bg-white/10 text-white/90 text-sm px-2 py-1 rounded outline-none focus:ring-1 focus:ring-white/20"
                            maxLength={100}
                        />
                        <button
                            onClick={handleSave}
                            className="no-drag p-1 rounded hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors"
                        >
                            <LuCheck size={14} />
                        </button>
                        <button
                            onClick={handleCancel}
                            className="no-drag p-1 rounded hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors"
                        >
                            <LuX size={14} />
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-1 min-w-0 group">
                        <span
                            className={`text-sm text-white/70 truncate ${isGeneratingTitle ? 'animate-wiggle' : ''}`}
                        >
                            {animatingTitle ? (
                                <span className="animate-letter-reveal">
                                    {animatingTitle.split('').map((char, i) => (
                                        <span
                                            key={i}
                                            style={{
                                                animationDelay: `${i * 50}ms`,
                                            }}
                                        >
                                            {char === ' ' ? '\u00A0' : char}
                                        </span>
                                    ))}
                                </span>
                            ) : (
                                title || 'New Thread'
                            )}
                        </span>
                        <button
                            onClick={() => setIsEditing(true)}
                            className="no-drag p-1 rounded hover:bg-white/10 text-white/30 hover:text-white/60 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                            title="Edit title"
                        >
                            <LuPencil size={12} />
                        </button>
                    </div>
                )}
            </div>

            {hasTranscript && (
                <button
                    onClick={onCopy}
                    className="no-drag p-1.5 rounded-md hover:bg-white/10 text-white/40 hover:text-white/80 transition-all shrink-0"
                    title={copied ? 'Copied!' : 'Copy last transcript'}
                >
                    {copied ? <LuCheck size={14} /> : <LuCopy size={14} />}
                </button>
            )}
        </div>
    )
}
