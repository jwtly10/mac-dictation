import {LuX, LuCircleAlert, LuTriangleAlert, LuCircleCheck, LuInfo} from 'react-icons/lu';
import {useAlerts, AlertType} from '../contexts/AlertContext';

const MAX_VISIBLE = 5;

const alertStyles: Record<AlertType, { bg: string; border: string; text: string; icon: typeof LuCircleAlert }> = {
    error: {
        bg: 'bg-red-500/10',
        border: 'border-red-500/30',
        text: 'text-red-200',
        icon: LuCircleAlert,
    },
    warning: {
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        text: 'text-amber-200',
        icon: LuTriangleAlert,
    },
    success: {
        bg: 'bg-green-500/10',
        border: 'border-green-500/30',
        text: 'text-green-200',
        icon: LuCircleCheck,
    },
    info: {
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/30',
        text: 'text-blue-200',
        icon: LuInfo,
    },
};

export function AlertToast() {
    const {alerts, dismissAlert} = useAlerts();
    const visibleAlerts = alerts.slice(-MAX_VISIBLE);

    if (visibleAlerts.length === 0) {
        return null;
    }

    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
            {visibleAlerts.map((alert) => {
                const style = alertStyles[alert.type];
                const Icon = style.icon;
                return (
                    <div
                        key={alert.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border ${style.bg} ${style.border} backdrop-blur-sm animate-in slide-in-from-right duration-200`}
                    >
                        <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${style.text}`}/>
                        <p className={`flex-1 text-sm ${style.text}`}>{alert.message}</p>
                        <button
                            onClick={() => dismissAlert(alert.id)}
                            className={`shrink-0 p-1 rounded hover:bg-white/10 transition-colors ${style.text}`}
                        >
                            <LuX className="w-4 h-4"/>
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
