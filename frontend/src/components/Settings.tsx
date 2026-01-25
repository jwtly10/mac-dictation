import {useCallback, useEffect, useState} from 'react';
import {LuArrowLeft, LuCheck, LuEye, LuEyeOff, LuLoader} from 'react-icons/lu';
import {App as AppService} from '../../bindings/mac-dictation';
import {useAlerts} from '../contexts/AlertContext';

interface Props {
    onBack: () => void;
    onKeysUpdated?: () => void;
}

interface SettingInputProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    onSave: () => void;
    placeholder?: string;
    saving?: boolean;
    saved?: boolean;
}

function SettingInput({label, value, onChange, onSave, placeholder, saving, saved}: Readonly<SettingInputProps>) {
    const [visible, setVisible] = useState(false);

    const handleBlur = () => {
        onSave();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            onSave();
        }
    };

    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium text-white/70">{label}</label>
            <div className="relative">
                <input
                    type={visible ? 'text' : 'password'}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 pr-20 bg-white/5 border border-white/10 rounded-lg text-white/90 placeholder-white/30 focus:outline-none focus:border-white/30 text-sm font-mono"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {saving && (
                        <LuLoader size={14} className="text-white/40 animate-spin"/>
                    )}
                    {saved && !saving && (
                        <LuCheck size={14} className="text-green-400"/>
                    )}
                    <button
                        type="button"
                        onClick={() => setVisible(!visible)}
                        className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white/60 transition-colors"
                    >
                        {visible ? <LuEyeOff size={14}/> : <LuEye size={14}/>}
                    </button>
                </div>
            </div>
        </div>
    );
}

export function Settings({onBack, onKeysUpdated}: Readonly<Props>) {
    const [deepgramKey, setDeepgramKey] = useState('');
    const [openaiKey, setOpenaiKey] = useState('');
    const [loading, setLoading] = useState(true);
    const [savingDeepgram, setSavingDeepgram] = useState(false);
    const [savingOpenai, setSavingOpenai] = useState(false);
    const [savedDeepgram, setSavedDeepgram] = useState(false);
    const [savedOpenai, setSavedOpenai] = useState(false);
    const {addAlert} = useAlerts();

    const keysConfigured = deepgramKey.trim() !== '' && openaiKey.trim() !== '';

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const [dg, oai] = await Promise.all([
                    AppService.GetSetting('deepgram_api_key'),
                    AppService.GetSetting('openai_api_key'),
                ]);
                setDeepgramKey(dg);
                setOpenaiKey(oai);
            } catch (err) {
                addAlert('error', `Failed to load settings: ${err}`);
            } finally {
                setLoading(false);
            }
        };
        loadSettings();
    }, [addAlert]);

    const saveDeepgramKey = useCallback(async () => {
        setSavingDeepgram(true);
        setSavedDeepgram(false);
        try {
            await AppService.SetSetting('deepgram_api_key', deepgramKey);
            setSavedDeepgram(true);
            setTimeout(() => setSavedDeepgram(false), 2000);
            onKeysUpdated?.();
        } catch (err) {
            addAlert('error', `Failed to save Deepgram key: ${err}`);
        } finally {
            setSavingDeepgram(false);
        }
    }, [deepgramKey, onKeysUpdated, addAlert]);

    const saveOpenaiKey = useCallback(async () => {
        setSavingOpenai(true);
        setSavedOpenai(false);
        try {
            await AppService.SetSetting('openai_api_key', openaiKey);
            setSavedOpenai(true);
            setTimeout(() => setSavedOpenai(false), 2000);
            onKeysUpdated?.();
        } catch (err) {
            addAlert('error', `Failed to save OpenAI key: ${err}`);
        } finally {
            setSavingOpenai(false);
        }
    }, [openaiKey, onKeysUpdated, addAlert]);

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
                    <div>
                        <h2 className="text-sm font-medium text-white/50 uppercase tracking-wider mb-4">API Keys</h2>
                        <div className="space-y-4">
                            <SettingInput
                                label="Deepgram API Key"
                                value={deepgramKey}
                                onChange={setDeepgramKey}
                                onSave={saveDeepgramKey}
                                placeholder="Enter your Deepgram API key"
                                saving={savingDeepgram}
                                saved={savedDeepgram}
                            />
                            <SettingInput
                                label="OpenAI API Key"
                                value={openaiKey}
                                onChange={setOpenaiKey}
                                onSave={saveOpenaiKey}
                                placeholder="Enter your OpenAI API key"
                                saving={savingOpenai}
                                saved={savedOpenai}
                            />
                        </div>
                    </div>

                    <div className="pt-4 border-t border-white/10">
                        <p className="text-xs text-white/40">
                            API keys are stored locally in your database and are never sent anywhere except to their respective services.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
