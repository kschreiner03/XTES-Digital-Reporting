
import React, { useState, useEffect, useRef } from 'react';
import { CloseIcon, TrashIcon } from './icons';
import { clearDatabase } from './db';
import { useTheme } from './ThemeContext';
import { getAssetUrl } from './SafeImage';
import ConfirmModal from './ConfirmModal';
import { toast } from './Toast';

interface SettingsModalProps {
    onClose: () => void;
}

// Common spell check language options
const SPELL_CHECK_LANGUAGES = [
    { code: 'en-US', name: 'English (US)' },
    { code: 'en-CA', name: 'English (Canada)' },
    { code: 'en-GB', name: 'English (UK)' },
    { code: 'en-AU', name: 'English (Australia)' },
    { code: 'fr-FR', name: 'French (France)' },
    { code: 'fr-CA', name: 'French (Canada)' },
    { code: 'es-ES', name: 'Spanish (Spain)' },
    { code: 'es-MX', name: 'Spanish (Mexico)' },
    { code: 'de-DE', name: 'German' },
    { code: 'pt-BR', name: 'Portuguese (Brazil)' },
    { code: 'it-IT', name: 'Italian' },
    { code: 'nl-NL', name: 'Dutch' },
];

const LANDING_PHOTO_PRESET_KEY = 'xtec_landing_photo_preset';

interface PresetWallpaper {
    fileName: string;
    label: string;
}

const PRESET_WALLPAPERS: PresetWallpaper[] = [
    { fileName: 'landscape.JPG', label: 'Oil Field' },
    { fileName: 'bison1.jpg', label: 'Bison' },
    { fileName: 'wallpaper/116911439_10223823748248481_4788712539515562122_o - Copy.jpg', label: 'Lake Sunset' },
    { fileName: 'wallpaper/bison rock - Copy.jpg', label: 'Prairie' },
    { fileName: 'wallpaper/Breeding Bird Surveys_CL.jpg', label: 'Yellow Warbler' },
    { fileName: 'wallpaper/common nighthawk - Copy.JPG', label: 'Nighthawk' },
    { fileName: 'wallpaper/DJI_0041.JPG', label: 'Aerial' },
    { fileName: 'wallpaper/IMG_0009_CL.jpg', label: 'Wildflowers' },
    { fileName: 'wallpaper/IMG_0283.JPG', label: 'Sinkhole' },
    { fileName: 'wallpaper/Owl.jpg', label: 'Great Grey Owl' },
    { fileName: 'wallpaper/trinity-berry-scenery-2024.jpg', label: 'Scenery' },
];

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
    const [activeTab, setActiveTab] = useState('general');
    // Pre-resolve all wallpaper URLs immediately on mount so images are ready by the time
    // the entrance animation finishes (160ms). Uses the SafeImage module cache on re-opens.
    const [wallpaperUrls, setWallpaperUrls] = useState<Record<string, string>>({});
    useEffect(() => {
        Promise.all(
            PRESET_WALLPAPERS.map(p => getAssetUrl(p.fileName).then(url => [p.fileName, url] as const))
        ).then(entries => setWallpaperUrls(Object.fromEntries(entries)));
    }, []);
    const [usageEstimate, setUsageEstimate] = useState<string | null>(null);
    const [quotaEstimate, setQuotaEstimate] = useState<string | null>(null);
    const [isClearing, setIsClearing] = useState(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [defaults, setDefaults] = useState({ defaultProponent: '', defaultMonitor: '' });
    const [spellCheckLanguages, setSpellCheckLanguages] = useState<string[]>(['en-US', 'en-CA']);
    const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
    const [spellCheckSaved, setSpellCheckSaved] = useState(false);
    const AUTOSAVE_INTERVAL_KEY = 'xtec_autosave_interval';
    const [autosaveInterval, setAutosaveInterval] = useState<number>(() => parseInt(localStorage.getItem(AUTOSAVE_INTERVAL_KEY) || '30'));
    const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
    const [profilePicture, setProfilePicture] = useState<string | null>(() => localStorage.getItem('xtec_profile_picture'));
    const [username, setUsername] = useState('User');
    const profileInputRef = useRef<HTMLInputElement>(null);
    const { theme, setTheme } = useTheme();
    const [displayScaleSetting, setDisplayScaleSetting] = useState<string>(() => localStorage.getItem('xtec_display_scale') || 'auto');
    const [mediaPlayerEnabled, setMediaPlayerEnabled] = useState<boolean>(() => localStorage.getItem('xtec_media_player_enabled') !== 'false');
    const [mediaPlayerPosition, setMediaPlayerPosition] = useState<string>(() => localStorage.getItem('xtec_media_player_position') || 'bottom-left');

    const handleDisplayScaleChange = (value: string) => {
        setDisplayScaleSetting(value);
        localStorage.setItem('xtec_display_scale', value);
        window.dispatchEvent(new CustomEvent('xtec-display-scale-changed'));
    };

    const hasActivePhoto = !!selectedPreset;

    useEffect(() => {
        const checkStorage = async () => {
            if (navigator.storage && navigator.storage.estimate) {
                try {
                    const estimate = await navigator.storage.estimate();
                    
                    // Check type explicitly because 0 is a valid number but falsy in boolean checks
                    if (typeof estimate.usage === 'number') {
                        setUsageEstimate((estimate.usage / (1024 * 1024)).toFixed(2));
                    } else {
                        setUsageEstimate('Unknown');
                    }

                    if (typeof estimate.quota === 'number') {
                        setQuotaEstimate((estimate.quota / (1024 * 1024)).toFixed(2));
                    }
                } catch (error) {
                    console.error("Failed to estimate storage:", error);
                    setUsageEstimate('Error');
                }
            } else {
                setUsageEstimate('N/A');
            }
        };
        checkStorage();

        // Load username
        try {
            const electronAPI = (window as any).electronAPI;
            if (electronAPI?.getUserInfo) {
                const info = electronAPI.getUserInfo();
                if (info?.username) setUsername(info.username);
            }
        } catch (e) { /* ignore */ }

        // Load defaults
        try {
            const savedSettings = localStorage.getItem('xtec_general_settings');
            if (savedSettings) {
                setDefaults(JSON.parse(savedSettings));
            }
        } catch (e) {
            console.error("Failed to load settings", e);
        }

        // Load saved preset wallpaper
        const savedPreset = localStorage.getItem(LANDING_PHOTO_PRESET_KEY);
        if (savedPreset) {
            setSelectedPreset(savedPreset);
        }

        // Load spell check languages
        const loadSpellCheckSettings = async () => {
            const electronAPI = (window as any).electronAPI;

            // First, try to load saved preferences from localStorage
            const savedLanguages = localStorage.getItem('xtec_spellcheck_languages');
            if (savedLanguages && electronAPI?.setSpellCheckLanguages) {
                try {
                    const languages = JSON.parse(savedLanguages);
                    if (Array.isArray(languages) && languages.length > 0) {
                        await electronAPI.setSpellCheckLanguages(languages);
                        setSpellCheckLanguages(languages);
                    }
                } catch (e) {
                    console.error("Failed to restore spell check languages", e);
                }
            } else if (electronAPI?.getSpellCheckLanguages) {
                // Fall back to getting current languages from Electron
                try {
                    const result = await electronAPI.getSpellCheckLanguages();
                    if (result.success && result.languages) {
                        setSpellCheckLanguages(result.languages);
                    }
                } catch (e) {
                    console.error("Failed to load spell check languages", e);
                }
            }

            // Load available languages
            if (electronAPI?.getAvailableSpellCheckLanguages) {
                try {
                    const result = await electronAPI.getAvailableSpellCheckLanguages();
                    if (result.success && result.languages) {
                        setAvailableLanguages(result.languages);
                    }
                } catch (e) {
                    console.error("Failed to load available spell check languages", e);
                }
            }
        };
        loadSpellCheckSettings();
    }, []);

    const handleClearData = () => setShowClearConfirm(true);

    const confirmClearData = async () => {
        setShowClearConfirm(false);
        setIsClearing(true);
        try {
            await clearDatabase();
            localStorage.removeItem('xtec_recent_projects');
            toast('Storage cleared. Reloading…', 'success');
            setTimeout(() => window.location.reload(), 1200);
        } catch (e) {
            console.error("Failed to clear storage:", e);
            toast('An error occurred while clearing storage. Please restart the app manually.', 'error');
            setIsClearing(false);
        }
    };

    const handleDefaultChange = (field: string, value: string) => {
        const newDefaults = { ...defaults, [field]: value };
        setDefaults(newDefaults);
        localStorage.setItem('xtec_general_settings', JSON.stringify(newDefaults));
    };

    const handleAutosaveIntervalChange = (seconds: number) => {
        setAutosaveInterval(seconds);
        localStorage.setItem(AUTOSAVE_INTERVAL_KEY, String(seconds));
    };

    const handleProfilePictureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result as string;
            // Resize to 128x128 to keep localStorage small
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 128;
                canvas.height = 128;
                const ctx = canvas.getContext('2d')!;
                const size = Math.min(img.width, img.height);
                const sx = (img.width - size) / 2;
                const sy = (img.height - size) / 2;
                ctx.drawImage(img, sx, sy, size, size, 0, 0, 128, 128);
                const resized = canvas.toDataURL('image/jpeg', 0.85);
                localStorage.setItem('xtec_profile_picture', resized);
                setProfilePicture(resized);
            };
            img.src = dataUrl;
        };
        reader.readAsDataURL(file);
        if (profileInputRef.current) profileInputRef.current.value = '';
    };

    const handleRemoveProfilePicture = () => {
        localStorage.removeItem('xtec_profile_picture');
        setProfilePicture(null);
    };

    const handleRemoveLandingPhoto = () => {
        localStorage.removeItem(LANDING_PHOTO_PRESET_KEY);
        // Clean up any legacy custom photo / position / zoom keys
        localStorage.removeItem('xtec_landing_photo');
        localStorage.removeItem('xtec_landing_photo_position');
        localStorage.removeItem('xtec_landing_photo_zoom');
        setSelectedPreset(null);
    };

    const handleSelectPreset = (preset: PresetWallpaper) => {
        setSelectedPreset(preset.fileName);
        localStorage.setItem(LANDING_PHOTO_PRESET_KEY, preset.fileName);
        window.dispatchEvent(new CustomEvent('xtec-bg-photo-changed'));
    };

    const handleSpellCheckLanguageChange = async (langCode: string) => {
        const electronAPI = (window as any).electronAPI;
        if (!electronAPI?.setSpellCheckLanguages) {
            alert("Spell check API not available. Please restart the application.");
            return;
        }

        const newLanguages = [langCode];

        try {
            const result = await electronAPI.setSpellCheckLanguages(newLanguages);
            if (result.success) {
                setSpellCheckLanguages(newLanguages);
                // Save to localStorage for persistence across sessions
                localStorage.setItem('xtec_spellcheck_languages', JSON.stringify(newLanguages));
                // Show saved indicator
                setSpellCheckSaved(true);
                setTimeout(() => setSpellCheckSaved(false), 2000);
            } else {
                console.error("Failed to set spell check language:", result.error);
                alert("Failed to change spell check language. The language dictionary may not be available.");
            }
        } catch (e) {
            console.error("Failed to set spell check language", e);
            alert("Error changing spell check language: " + (e as Error).message);
        }
    };

    const NAV_TABS = [
        {
            id: 'general', label: 'General',
            icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
        },
        {
            id: 'display', label: 'Display',
            icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" /></svg>,
        },
        {
            id: 'data', label: 'Data',
            icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>,
        },
    ];

    const SectionLabel = ({ children, danger }: { children: React.ReactNode; danger?: boolean }) => (
        <p className={`text-[11px] font-semibold uppercase tracking-widest mb-4 ${danger ? 'text-red-500 dark:text-red-400' : 'text-[#007D8C]'}`}>{children}</p>
    );

    const selectClass = "text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-800 dark:text-white focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition cursor-pointer";

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="xtec-modal-enter bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-2xl w-full max-w-3xl h-[620px] flex overflow-hidden border border-gray-200 dark:border-[#007D8C]/20">

                {/* ── Sidebar ── */}
                <div className="w-52 shrink-0 bg-gray-50 dark:bg-[#161618] border-r border-gray-200 dark:border-[#007D8C]/15 flex flex-col">
                    <div className="px-5 pt-6 pb-5">
                        <h2 className="text-base font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">Settings</h2>
                        <div style={{ width: 28, height: 2, background: 'linear-gradient(90deg,#007D8C,rgba(0,125,140,0.15))', borderRadius: 1, marginTop: 6 }} />
                    </div>
                    <nav className="flex-1 px-2 space-y-0.5">
                        {NAV_TABS.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                                    activeTab === tab.id
                                        ? 'bg-[#007D8C]/10 dark:bg-[#007D8C]/15 text-[#007D8C]'
                                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white'
                                }`}
                            >
                                <span className={activeTab === tab.id ? 'text-[#007D8C]' : 'text-gray-400 dark:text-gray-500'}>{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                    <div className="px-5 pb-5">
                        <p className="text-[10px] text-gray-300 dark:text-gray-600 select-none">X-TES Digital Reporting</p>
                    </div>
                </div>

                {/* ── Content ── */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Content header */}
                    <div className="flex items-center justify-between px-7 pt-5 pb-4 border-b border-gray-100 dark:border-white/5 shrink-0">
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 capitalize">
                            {activeTab === 'data' ? 'Data Management' : activeTab}
                        </h3>
                        <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors" aria-label="Close settings">
                            <CloseIcon className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Scrollable body */}
                    <div className="flex-1 overflow-y-auto px-7 py-6">

                        {/* ── GENERAL ── */}
                        {activeTab === 'general' && (
                            <div className="space-y-8">
                                <div>
                                    <SectionLabel>Profile</SectionLabel>
                                    <div className="flex items-center gap-4">
                                        {profilePicture ? (
                                            <img src={profilePicture} alt="Profile" className="w-12 h-12 rounded-xl object-cover border border-gray-200 dark:border-white/10 shrink-0" />
                                        ) : (
                                            <div className="w-12 h-12 rounded-xl bg-[#007D8C] flex items-center justify-center text-white text-lg font-bold shrink-0">
                                                {username.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">{username}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Shown on comments and replies.</p>
                                            <div className="flex gap-2">
                                                <button onClick={() => profileInputRef.current?.click()} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                                                    {profilePicture ? 'Change Photo' : 'Upload Photo'}
                                                </button>
                                                {profilePicture && (
                                                    <button onClick={handleRemoveProfilePicture} className="px-3 py-1.5 text-xs font-medium rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">Remove</button>
                                                )}
                                            </div>
                                            <input ref={profileInputRef} type="file" accept="image/*" onChange={handleProfilePictureUpload} className="hidden" />
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <SectionLabel>Spell Check</SectionLabel>
                                    <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-white/5">
                                        <div>
                                            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Language</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Dictionary used for spell checking.</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {spellCheckSaved && <span className="text-xs text-green-600 dark:text-green-400 font-medium">Saved</span>}
                                            <select value={spellCheckLanguages[0] || 'en-US'} onChange={(e) => handleSpellCheckLanguageChange(e.target.value)} className={`w-44 ${selectClass}`}>
                                                {SPELL_CHECK_LANGUAGES.map((lang) => {
                                                    const isAvailable = availableLanguages.length === 0 || availableLanguages.includes(lang.code);
                                                    return <option key={lang.code} value={lang.code} disabled={!isAvailable}>{lang.name}{!isAvailable ? ' (unavailable)' : ''}</option>;
                                                })}
                                            </select>
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">Changes apply to new text. Restart if spell check doesn't update.</p>
                                </div>

                                <div>
                                    <SectionLabel>Auto-Save</SectionLabel>
                                    <div className="flex items-center justify-between py-3">
                                        <div>
                                            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Save Interval</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">How often to auto-save while a report has unsaved changes.</p>
                                        </div>
                                        <select value={autosaveInterval} onChange={(e) => handleAutosaveIntervalChange(parseInt(e.target.value))} className={selectClass}>
                                            <option value={15}>15 seconds</option>
                                            <option value={30}>30 seconds</option>
                                            <option value={60}>1 minute</option>
                                            <option value={120}>2 minutes</option>
                                            <option value={300}>5 minutes</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <SectionLabel>Default Values</SectionLabel>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Pre-fill new reports automatically.</p>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Default Proponent</label>
                                            <input type="text" value={defaults.defaultProponent} onChange={(e) => handleDefaultChange('defaultProponent', e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition" placeholder="e.g., Cenovus, CNRL" />
                                            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Used in Photo Logs and Standard DFRs.</p>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Default Monitor Name</label>
                                            <input type="text" value={defaults.defaultMonitor} onChange={(e) => handleDefaultChange('defaultMonitor', e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition" placeholder="e.g., John Doe" />
                                            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Used in DFRs.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── DISPLAY ── */}
                        {activeTab === 'display' && (
                            <div className="space-y-8">
                                <div>
                                    <SectionLabel>Theme</SectionLabel>
                                    <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-white/5">
                                        <div>
                                            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Appearance</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Choose your preferred look.</p>
                                        </div>
                                        <select value={theme} onChange={(e) => setTheme(e.target.value as 'light' | 'dark')} className={selectClass}>
                                            <option value="light">Light</option>
                                            <option value="dark">Dark</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <SectionLabel>Screen Size</SectionLabel>
                                    <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-white/5">
                                        <div>
                                            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">UI Scale</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Fit the landing page to your screen.</p>
                                        </div>
                                        <select value={displayScaleSetting} onChange={(e) => handleDisplayScaleChange(e.target.value)} className={`w-52 ${selectClass}`}>
                                            <option value="auto">Auto — Fit to Screen</option>
                                            <optgroup label="Laptop">
                                                <option value="0.60">11" Laptop (1280×720)</option>
                                                <option value="0.65">11"–12" Laptop (1366×768)</option>
                                                <option value="0.72">13" Laptop (1280×800)</option>
                                                <option value="0.78">13" MacBook (1440×900)</option>
                                                <option value="0.84">14" Laptop (1600×900)</option>
                                                <option value="0.90">15" Laptop (1920×1080)</option>
                                                <option value="0.95">15" High-DPI</option>
                                            </optgroup>
                                            <optgroup label="Desktop Monitor">
                                                <option value="1.00">Desktop HD (1920×1080)</option>
                                                <option value="1.05">FHD+ (2048×1152)</option>
                                                <option value="1.08">Large (2560×1440)</option>
                                                <option value="1.12">Ultra-Wide / 4K</option>
                                            </optgroup>
                                        </select>
                                    </div>
                                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">Auto detects your screen. Choose manually if Auto doesn't look right.</p>
                                </div>

                                <div>
                                    <SectionLabel>Background</SectionLabel>
                                    <div className="grid grid-cols-5 gap-2 mb-3">
                                        {PRESET_WALLPAPERS.map((preset) => {
                                            const isSelected = selectedPreset === preset.fileName;
                                            return (
                                                <button key={preset.fileName} onClick={() => handleSelectPreset(preset)} title={preset.label} style={{ aspectRatio: '16/9' }}
                                                    className={`relative rounded-xl overflow-hidden border-2 transition-all duration-150 group focus:outline-none ${isSelected ? 'border-[#007D8C] ring-2 ring-[#007D8C]/20' : 'border-gray-200 dark:border-white/10 hover:border-[#007D8C]/50'}`}>
                                                    {wallpaperUrls[preset.fileName] && <img src={wallpaperUrls[preset.fileName]} alt={preset.label} className="w-full h-full object-cover" draggable={false} />}
                                                    <div className={`absolute inset-0 flex items-end justify-center pb-1 bg-gradient-to-t from-black/60 to-transparent ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                                                        <span className="text-[10px] font-medium text-white">{preset.label}</span>
                                                    </div>
                                                    {isSelected && (
                                                        <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#007D8C] flex items-center justify-center">
                                                            <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {hasActivePhoto && (
                                        <button onClick={() => { handleRemoveLandingPhoto(); window.dispatchEvent(new CustomEvent('xtec-bg-photo-changed')); }} className="text-xs text-red-500 hover:text-red-600 font-medium transition-colors">
                                            Reset to Default
                                        </button>
                                    )}
                                </div>

                                <div>
                                    <SectionLabel>Media Player</SectionLabel>
                                    <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-white/5">
                                        <div>
                                            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Show Widget</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Display now-playing while using the app.</p>
                                        </div>
                                        <button role="switch" aria-checked={mediaPlayerEnabled}
                                            onClick={() => { const next = !mediaPlayerEnabled; setMediaPlayerEnabled(next); localStorage.setItem('xtec_media_player_enabled', String(next)); window.dispatchEvent(new CustomEvent('xtec-media-player-changed')); }}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#007D8C]/40 ${mediaPlayerEnabled ? 'bg-[#007D8C]' : 'bg-gray-200 dark:bg-white/10'}`}>
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${mediaPlayerEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                        </button>
                                    </div>
                                    {mediaPlayerEnabled && (
                                        <div className="flex items-center justify-between py-3">
                                            <div>
                                                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Position</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">Where the widget appears on screen.</p>
                                            </div>
                                            <select value={mediaPlayerPosition} onChange={(e) => { setMediaPlayerPosition(e.target.value); localStorage.setItem('xtec_media_player_position', e.target.value); window.dispatchEvent(new CustomEvent('xtec-media-player-changed')); }} className={selectClass}>
                                                <option value="bottom-left">Bottom Left</option>
                                                <option value="bottom-right">Bottom Right</option>
                                                <option value="top-left">Top Left</option>
                                                <option value="top-right">Top Right</option>
                                            </select>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── DATA ── */}
                        {activeTab === 'data' && (
                            <div className="space-y-8">
                                <div>
                                    <SectionLabel>Storage</SectionLabel>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Photos and recent projects are stored locally for offline access and quick loading.</p>
                                    <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 border border-gray-200 dark:border-white/10 mb-2">
                                        <div className="flex items-center justify-between mb-2.5">
                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Storage Used</span>
                                            <span className="text-sm font-semibold text-[#007D8C]">
                                                {usageEstimate !== null ? `${usageEstimate} MB` : 'Calculating…'}
                                                {quotaEstimate && <span className="text-xs font-normal text-gray-400 dark:text-gray-500"> / {quotaEstimate} MB</span>}
                                            </span>
                                        </div>
                                        {usageEstimate && quotaEstimate && (
                                            <div className="w-full h-1.5 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                                                <div className="h-full bg-[#007D8C] rounded-full transition-all" style={{ width: `${Math.min((parseFloat(usageEstimate) / parseFloat(quotaEstimate)) * 100, 100)}%` }} />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <SectionLabel danger>Danger Zone</SectionLabel>
                                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl p-4">
                                        <p className="text-sm font-semibold text-red-800 dark:text-red-300 mb-1">Clear All Local Data</p>
                                        <p className="text-xs text-red-600 dark:text-red-400 mb-4">
                                            Deletes all projects from Recent Projects and removes cached photos from the internal database.<br/><br/>
                                            <strong>Files saved to your hard drive are not affected.</strong>
                                        </p>
                                        <button onClick={handleClearData} disabled={isClearing} className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-semibold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition">
                                            {isClearing ? <span>Clearing…</span> : <><TrashIcon className="h-4 w-4" /><span>Clear Recent Projects & Photos</span></>}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            </div>
            {showClearConfirm && (
                <ConfirmModal
                    title="Clear all data?"
                    message="All recent projects and photos will be permanently deleted. Files already saved to your computer will NOT be affected. This action cannot be undone."
                    confirmLabel="Clear All"
                    destructive
                    onConfirm={confirmClearData}
                    onCancel={() => setShowClearConfirm(false)}
                />
            )}
        </div>
    );
};

export default SettingsModal;
