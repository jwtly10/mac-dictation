import { LuCheck, LuCopy, LuX } from 'react-icons/lu'

interface Props {
    provider?: string
    hasTranscript: boolean
    copied: boolean
    onCopy: () => void
    onHide: () => void
}

export function HeaderActions({
    provider,
    hasTranscript,
    copied,
    onCopy,
    onHide,
}: Readonly<Props>) {
    return (
        <div className="flex items-center gap-1">
            {provider && (
                <span className="text-[10px] text-white/30 mr-1">
                    {provider}
                </span>
            )}
            {hasTranscript && (
                <button
                    onClick={onCopy}
                    className="no-drag p-1.5 rounded-md hover:bg-white/10 text-white/40 hover:text-white/80 transition-all"
                    title={copied ? 'Copied!' : 'Copy transcript'}
                >
                    {copied ? <LuCheck size={14} /> : <LuCopy size={14} />}
                </button>
            )}
            <button
                onClick={onHide}
                className="no-drag p-1.5 rounded-md hover:bg-white/10 text-white/40 hover:text-white/80 transition-all"
                title="Hide window"
            >
                <LuX size={14} />
            </button>
        </div>
    )
}
