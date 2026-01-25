import {createContext, useContext, useState, useCallback, ReactNode} from 'react';

export type AlertType = 'error' | 'warning' | 'success' | 'info';

export interface Alert {
    id: string;
    type: AlertType;
    message: string;
    timestamp: Date;
}

interface AlertContextValue {
    alerts: Alert[];
    addAlert: (type: AlertType, message: string) => void;
    dismissAlert: (id: string) => void;
    clearAll: () => void;
}

const AlertContext = createContext<AlertContextValue | null>(null);

let alertIdCounter = 0;

function generateId(): string {
    return `alert-${Date.now()}-${++alertIdCounter}`;
}

interface AlertProviderProps {
    children: ReactNode;
}

export function AlertProvider({children}: AlertProviderProps) {
    const [alerts, setAlerts] = useState<Alert[]>([]);

    const addAlert = useCallback((type: AlertType, message: string) => {
        const newAlert: Alert = {
            id: generateId(),
            type,
            message,
            timestamp: new Date(),
        };
        setAlerts(prev => [...prev, newAlert]);
    }, []);

    const dismissAlert = useCallback((id: string) => {
        setAlerts(prev => prev.filter(alert => alert.id !== id));
    }, []);

    const clearAll = useCallback(() => {
        setAlerts([]);
    }, []);

    return (
        <AlertContext.Provider value={{alerts, addAlert, dismissAlert, clearAll}}>
            {children}
        </AlertContext.Provider>
    );
}

export function useAlerts(): AlertContextValue {
    const context = useContext(AlertContext);
    if (!context) {
        throw new Error('useAlerts must be used within an AlertProvider');
    }
    return context;
}
