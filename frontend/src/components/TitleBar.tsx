import { LuX } from 'react-icons/lu'

interface Props {
    onHide: () => void
}

export function TitleBar({ onHide }: Readonly<Props>) {
    return (
        <div className="flex items-center justify-start px-2 py-1.5 shrink-0 drag-handle">
            <button
                onClick={onHide}
                className="no-drag w-3 h-3 rounded-full bg-white/20 hover:bg-red-500 transition-colors group flex items-center justify-center"
                title="Hide window"
            >
                <LuX
                    size={8}
                    className="opacity-0 group-hover:opacity-100 text-white"
                />
            </button>
        </div>
    )
}
