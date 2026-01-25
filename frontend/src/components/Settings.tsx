import {useCallback, useEffect, useState} from 'react';
import {LuArrowLeft, LuCheck, LuEye, LuEyeOff, LuLoader, LuX} from 'react-icons/lu';
import {App as AppService} from '../../bindings/mac-dictation';
import {useAlerts} from '../contexts/AlertContext';

type SettingType = 'secret' | 'number';

interface SettingConfig {
    key: string;
    label: string;
    type: SettingType;
    placeholder?: string;
    section: string;
    parse: (value: string) => string | number;
    serialize: (value: string | number) => string;
    notifyOnChange?: boolean;
}

type SettingValue = string | number;

const SETTINGS: SettingConfig[] = [
    {
        key: 'deepgram_api_key',
        label: 'Deepgram API Key',
        type: 'secret',
        placeholder: 'Enter your Deepgram API key',
        section: 'API Keys',
        parse: (v) => v,
        serialize: String,
        notifyOnChange: true,
    },
    {
        key: 'openai_api_key',
        label: 'OpenAI API Key',
        type: 'secret',
        placeholder: 'Enter your OpenAI API key',
        section: 'API Keys',
        parse: (v) => v,
        serialize: String,
        notifyOnChange: true,
    },
    {
        key: 'min_recording_duration',
        label: 'Minimum Recording Duration (seconds)',
        type: 'number',
        placeholder: '5',
        section: 'Recording',
        parse: (v) => {
            const n = Number(v);
            return isNaN(n) ? 5 : n;
        },
        serialize: String,
    },
];

const SECTIONS = [...new Set(SETTINGS.map((s) => s.section))];

interface Props {
    onBack: () => void;
    onKeysUpdated?: () => void;
}

interface SettingInputProps {
    config: SettingConfig;
    value: SettingValue;
    originalValue: SettingValue;
    saving: boolean;
    onChange: (value: SettingValue) => void;
    onSave: () => void;
    onReset: () => void;
}

function SettingInput({config, value, originalValue, saving, onChange, onSave, onReset}: Readonly<SettingInputProps>) {
    const [visible, setVisible] = useState(false);
    const isSecret = config.type === 'secret';
    const isDirty = value !== originalValue;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value;
        if (config.type === 'number') {
            onChange(rawValue === '' ? '' : Number(rawValue) || 0);
        } else {
            onChange(rawValue);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && isDirty) onSave();
        if (e.key === 'Escape' && isDirty) onReset();
    };

    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium text-white/70">{config.label}</label>
            <div className="relative">
                <input
                    type={isSecret && !visible ? 'password' : config.type === 'number' ? 'number' : 'text'}
                    value={value}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    placeholder={config.placeholder}
                    className="w-full px-3 py-2 pr-24 bg-white/5 border border-white/10 rounded-lg text-white/90 placeholder-white/30 focus:outline-none focus:border-white/30 text-sm font-mono"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {saving && (
                        <LuLoader size={14} className="text-white/40 animate-spin"/>
                    )}
                    {!saving && isDirty && (
                        <>
                            <button
                                type="button"
                                onClick={onSave}
                                className="p-1 rounded hover:bg-green-500/20 text-green-400 hover:text-green-300 transition-colors"
                                title="Save"
                            >
                                <LuCheck size={14}/>
                            </button>
                            <button
                                type="button"
                                onClick={onReset}
                                className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white/60 transition-colors"
                                title="Reset"
                            >
                                <LuX size={14}/>
                            </button>
                        </>
                    )}
                    {isSecret && (
                        <button
                            type="button"
                            onClick={() => setVisible(!visible)}
                            className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white/60 transition-colors"
                        >
                            {visible ? <LuEyeOff size={14}/> : <LuEye size={14}/>}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export function Settings({onBack, onKeysUpdated}: Readonly<Props>) {
    const [values, setValues] = useState<Record<string, SettingValue>>({});
    const [original, setOriginal] = useState<Record<string, SettingValue>>({});
    const [saving, setSaving] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(true);
    const {addAlert} = useAlerts();

    const keysConfigured = SETTINGS
        .filter((s) => s.notifyOnChange)
        .every((s) => String(values[s.key] ?? '').trim() !== '');

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const allSettings = await AppService.GetAllSettings();
                const initialValues: Record<string, SettingValue> = {};
                for (const config of SETTINGS) {
                    initialValues[config.key] = config.parse(allSettings[config.key] ?? '');
                }
                setValues(initialValues);
                setOriginal(initialValues);
            } catch (err) {
                addAlert('error', `Failed to load settings: ${err}`);
            } finally {
                setLoading(false);
            }
        };
        loadSettings();
    }, [addAlert]);

    const updateValue = useCallback((key: string, value: SettingValue) => {
        setValues((prev) => ({...prev, [key]: value}));
    }, []);

    const resetValue = useCallback((key: string) => {
        setValues((prev) => ({...prev, [key]: original[key]}));
    }, [original]);

    const saveSetting = useCallback(async (config: SettingConfig) => {
        const value = values[config.key];
        if (value === original[config.key]) return;

        setSaving((prev) => ({...prev, [config.key]: true}));

        try {
            await AppService.SetSetting(config.key, config.serialize(value));
            setOriginal((prev) => ({...prev, [config.key]: value}));
            addAlert('success', `${config.label} saved`);
            if (config.notifyOnChange) {
                onKeysUpdated?.();
            }
        } catch (err) {
            addAlert('error', `Failed to save ${config.label}: ${err}`);
        } finally {
            setSaving((prev) => ({...prev, [config.key]: false}));
        }
    }, [values, original, onKeysUpdated, addAlert]);

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <LuLoader size={24} className="text-white/40 animate-spin"/>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-white/10">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 text-sm text-white/60 hover:text-white/90 transition-colors"
                >
                    <LuArrowLeft size={16}/>
                    Back
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                {!keysConfigured && (
                    <div className="mb-6 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                        <p className="text-sm text-amber-200/80">
                            Configure both API keys to enable recording.
                        </p>
                    </div>
                )}
                <h1 className="text-lg font-medium text-white/90 mb-6">Settings</h1>

                <div className="space-y-6 max-w-md">
                    {SECTIONS.map((section) => (
                        <div key={section}>
                            <h2 className="text-sm font-medium text-white/50 uppercase tracking-wider mb-4">
                                {section}
                            </h2>
                            <div className="space-y-4">
                                {SETTINGS.filter((s) => s.section === section).map((config) => (
                                    <SettingInput
                                        key={config.key}
                                        config={config}
                                        value={values[config.key]}
                                        originalValue={original[config.key]}
                                        saving={saving[config.key] ?? false}
                                        onChange={(value) => updateValue(config.key, value)}
                                        onSave={() => saveSetting(config)}
                                        onReset={() => resetValue(config.key)}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
