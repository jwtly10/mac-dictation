import {useCallback, useEffect, useRef, useState} from 'react';
import {LuCheck, LuChevronDown, LuChevronUp, LuCopy, LuFileText, LuSparkles} from 'react-icons/lu';
import {Message} from "../types";

interface Props {
    message: Message;
}

const MAX_COLLAPSED_HEIGHT = 120;

function formatTime(date: Date): string {
    return date.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'});
}

function formatFullDateTime(date: Date): string {
    return date.toLocaleString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatDuration(secs: number): string {
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    if (mins === 0) return `${remainingSecs}s`;
    return `${mins}m ${remainingSecs}s`;
}

export function MessageBubble({message}: Readonly<Props>) {
    const [copied, setCopied] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [needsExpansion, setNeedsExpansion] = useState(false);
    const [showOriginal, setShowOriginal] = useState(false);
    const textRef = useRef<HTMLDivElement>(null);

    const hasCleanedText = message.text && message.originalText && message.text !== message.originalText;
    const displayText = showOriginal ? message.originalText : (message.text || message.originalText);

    useEffect(() => {
        if (textRef.current) {
            setNeedsExpansion(textRef.current.scrollHeight > MAX_COLLAPSED_HEIGHT);
        }
    }, [displayText]);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(displayText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
        }
    }, [displayText]);

    return (
        <div className="group px-3 py-2">
            <div className="bg-white/5 rounded-xl px-4 py-3 max-w-full">
                <div
                    ref={textRef}
                    className={`text-sm text-white/85 leading-relaxed select-text overflow-hidden transition-all duration-200 ${
                        !isExpanded && needsExpansion ? 'max-h-[120px]' : 'max-h-none'
                    }`}
                    style={{
                        maskImage: !isExpanded && needsExpansion
                            ? 'linear-gradient(to bottom, black 70%, transparent 100%)'
                            : 'none',
                        WebkitMaskImage: !isExpanded && needsExpansion
                            ? 'linear-gradient(to bottom, black 70%, transparent 100%)'
                            : 'none',
                    }}
                >
                    {displayText}
                </div>

                {needsExpansion && (
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="no-drag flex items-center gap-1 mt-2 text-xs text-white/40 hover:text-white/60 transition-colors"
                    >
                        {isExpanded ? (
                            <>
                                <LuChevronUp size={12}/>
                                Show less
                            </>
                        ) : (
                            <>
                                <LuChevronDown size={12}/>
                                Show more
                            </>
                        )}
                    </button>
                )}

                <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/5">
                    <div className="flex items-center gap-2 text-[10px] text-white/30">
                        <span
                            className="cursor-default"
                            title={formatFullDateTime(message.createdAt)}
                        >
                            {formatTime(message.createdAt)}
                        </span>
                        <span>·</span>
                        <span>{formatDuration(message.durationSecs)}</span>
                        <span>·</span>
                        <span>{message.provider}</span>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {hasCleanedText && (
                            <button
                                onClick={() => setShowOriginal(!showOriginal)}
                                className={`no-drag p-1.5 rounded-md hover:bg-white/10 transition-colors ${
                                    showOriginal ? 'text-white/70' : 'text-white/40 hover:text-white/70'
                                }`}
                                title={showOriginal ? 'Show cleaned' : 'Show original'}
                            >
                                {showOriginal ? <LuSparkles size={12}/> : <LuFileText size={12}/>}
                            </button>
                        )}
                        <button
                            onClick={handleCopy}
                            className="no-drag p-1.5 rounded-md hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors"
                            title={copied ? 'Copied!' : 'Copy'}
                        >
                            {copied ? <LuCheck size={12}/> : <LuCopy size={12}/>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
