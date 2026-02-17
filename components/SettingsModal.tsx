
import React, { useState, useEffect } from 'react';
import { CloseIcon, TrashIcon } from './icons';
import { clearDatabase } from './db';
import { useTheme } from './ThemeContext';

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

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
    const [activeTab, setActiveTab] = useState('general');
    const [usageEstimate, setUsageEstimate] = useState<string | null>(null);
    const [quotaEstimate, setQuotaEstimate] = useState<string | null>(null);
    const [isClearing, setIsClearing] = useState(false);
    const [defaults, setDefaults] = useState({ defaultProponent: '', defaultMonitor: '' });
    const [spellCheckLanguages, setSpellCheckLanguages] = useState<string[]>(['en-US', 'en-CA']);
    const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
    const [spellCheckSaved, setSpellCheckSaved] = useState(false);
    const { isDarkMode, toggleTheme } = useTheme();

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

        // Load defaults
        try {
            const savedSettings = localStorage.getItem('xtec_general_settings');
            if (savedSettings) {
                setDefaults(JSON.parse(savedSettings));
            }
        } catch (e) {
            console.error("Failed to load settings", e);
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

    const handleClearData = async () => {
        if (!window.confirm("Are you sure you want to clear all recent projects and photos? This action cannot be undone. Files you have saved to your computer will NOT be deleted.")) {
            return;
        }

        setIsClearing(true);
        try {
            // Clear IndexedDB
            await clearDatabase();
            // Clear LocalStorage (Recent Projects List)
            localStorage.removeItem('xtec_recent_projects');
            
            alert('Storage cleared successfully. The application will now reload.');
            window.location.reload();
        } catch (e) {
            console.error("Failed to clear storage:", e);
            alert('An error occurred while clearing storage. Please restart the application manually.');
            setIsClearing(false);
        }
    };

    const handleDefaultChange = (field: string, value: string) => {
        const newDefaults = { ...defaults, [field]: value };
        setDefaults(newDefaults);
        localStorage.setItem('xtec_general_settings', JSON.stringify(newDefaults));
    };

    const handleSpellCheckLanguageChange = async (langCode: string) => {
        console.log("Changing spell check language to:", langCode);
        const electronAPI = (window as any).electronAPI;
        if (!electronAPI?.setSpellCheckLanguages) {
            console.error("electronAPI.setSpellCheckLanguages not available");
            alert("Spell check API not available. Please restart the application.");
            return;
        }

        const newLanguages = [langCode];

        try {
            console.log("Calling setSpellCheckLanguages with:", newLanguages);
            const result = await electronAPI.setSpellCheckLanguages(newLanguages);
            console.log("setSpellCheckLanguages result:", result);
            if (result.success) {
                setSpellCheckLanguages(newLanguages);
                // Save to localStorage for persistence across sessions
                localStorage.setItem('xtec_spellcheck_languages', JSON.stringify(newLanguages));
                // Show saved indicator
                setSpellCheckSaved(true);
                setTimeout(() => setSpellCheckSaved(false), 2000);
                console.log("Spell check language changed successfully to:", langCode);
            } else {
                console.error("Failed to set spell check language:", result.error);
                alert("Failed to change spell check language. The language dictionary may not be available.");
            }
        } catch (e) {
            console.error("Failed to set spell check language", e);
            alert("Error changing spell check language: " + (e as Error).message);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-3xl h-[600px] flex flex-col overflow-hidden transition-colors duration-200">
                <div className="flex justify-between items-center p-4 border-b bg-gray-50 dark:bg-gray-700 dark:border-gray-600">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Settings</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white transition-colors" aria-label="Close settings">
                        <CloseIcon className="h-8 w-8" />
                    </button>
                </div>
                <div className="flex flex-grow overflow-hidden">
                    {/* Sidebar */}
                    <div className="w-1/4 bg-gray-100 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 p-4">
                        <nav className="space-y-2">
                            <button
                                onClick={() => setActiveTab('general')}
                                className={`w-full text-left px-4 py-2 rounded-md font-medium transition-colors ${activeTab === 'general' ? 'bg-[#007D8C] text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'}`}
                            >
                                General
                            </button>
                             <button
                                onClick={() => setActiveTab('data')}
                                className={`w-full text-left px-4 py-2 rounded-md font-medium transition-colors ${activeTab === 'data' ? 'bg-[#007D8C] text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'}`}
                            >
                                Data Management
                            </button>
                        </nav>
                    </div>

                    {/* Content Area */}
                    <div className="w-3/4 p-8 overflow-y-auto bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                        {activeTab === 'general' && (
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4 border-b dark:border-gray-700 pb-2">Appearance</h3>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <span className="block text-base font-medium text-gray-700 dark:text-gray-300">Dark Mode</span>
                                            <span className="text-sm text-gray-500 dark:text-gray-400">Switch between light and dark themes.</span>
                                        </div>
                                        <button 
                                            onClick={toggleTheme}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#007D8C] focus:ring-offset-2 ${isDarkMode ? 'bg-[#007D8C]' : 'bg-gray-300'}`}
                                        >
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isDarkMode ? 'translate-x-6' : 'translate-x-1'}`} />
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4 border-b dark:border-gray-700 pb-2">Spell Check</h3>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <span className="block text-base font-medium text-gray-700 dark:text-gray-300">Language</span>
                                            <span className="text-sm text-gray-500 dark:text-gray-400">Select the language for spell checking.</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {spellCheckSaved && (
                                                <span className="text-sm text-green-600 dark:text-green-400 font-medium">Saved!</span>
                                            )}
                                            <select
                                                value={spellCheckLanguages[0] || 'en-US'}
                                                onChange={(e) => handleSpellCheckLanguageChange(e.target.value)}
                                                className="w-48 p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:ring-2 focus:ring-[#007D8C] focus:border-[#007D8C] transition cursor-pointer"
                                            >
                                                {SPELL_CHECK_LANGUAGES.map((lang) => {
                                                    const isAvailable = availableLanguages.length === 0 || availableLanguages.includes(lang.code);
                                                    return (
                                                        <option
                                                            key={lang.code}
                                                            value={lang.code}
                                                            disabled={!isAvailable}
                                                        >
                                                            {lang.name}{!isAvailable ? ' (unavailable)' : ''}
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                        Changes apply to new text. Restart the app if spell check doesn't update.
                                    </p>
                                </div>

                                <div>
                                    <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4 border-b dark:border-gray-700 pb-2">Default Values</h3>
                                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                                        Enter values here to automatically pre-fill new reports. This saves you from typing the same information every time.
                                    </p>
                                    
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Default Proponent</label>
                                            <input 
                                                type="text" 
                                                value={defaults.defaultProponent}
                                                onChange={(e) => handleDefaultChange('defaultProponent', e.target.value)}
                                                className="w-full p-2 border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md focus:ring-2 focus:ring-[#007D8C] focus:border-[#007D8C] transition"
                                                placeholder="e.g., Cenovus, CNRL"
                                            />
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Used in Photo Logs and Standard DFRs.</p>
                                        </div>
                                        
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Default Monitor Name</label>
                                            <input 
                                                type="text" 
                                                value={defaults.defaultMonitor}
                                                onChange={(e) => handleDefaultChange('defaultMonitor', e.target.value)}
                                                className="w-full p-2 border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md focus:ring-2 focus:ring-[#007D8C] focus:border-[#007D8C] transition"
                                                placeholder="e.g., John Doe"
                                            />
                                             <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Used in DFRs.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'data' && (
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4 border-b dark:border-gray-700 pb-2">Storage & Data</h3>
                                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                                        The application stores your recent projects and photos locally in this browser to allow for quick access and offline capability. 
                                        If you are running low on disk space or experiencing performance issues, you can clear this data.
                                    </p>
                                    
                                    <div className="bg-blue-50 dark:bg-blue-900/30 border-l-4 border-blue-500 p-4 mb-6">
                                        <div className="flex">
                                            <div className="flex-shrink-0">
                                                <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <div className="ml-3">
                                                <p className="text-sm text-blue-700 dark:text-blue-300">
                                                    Current Estimated Usage: <strong>{usageEstimate !== null ? `${usageEstimate} MB` : 'Calculating...'}</strong>
                                                    {quotaEstimate && ` / ${quotaEstimate} MB available`}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="border-t dark:border-gray-700 pt-6">
                                    <h4 className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">Danger Zone</h4>
                                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                                        <h5 className="font-bold text-red-800 dark:text-red-300 mb-1">Clear All Local Data</h5>
                                        <p className="text-sm text-red-600 dark:text-red-400 mb-4">
                                            This action will delete all projects from the "Recent Projects" list and remove all cached photos from the application's internal database.
                                            <br/><br/>
                                            <strong>Note:</strong> This will NOT delete any <code>.plog</code>, <code>.dfr</code>, or <code>.spdfr</code> files you have manually saved to your computer's hard drive.
                                        </p>
                                        <button
                                            onClick={handleClearData}
                                            disabled={isClearing}
                                            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200"
                                        >
                                            {isClearing ? (
                                                 <span>Clearing...</span>
                                            ) : (
                                                <>
                                                    <TrashIcon className="h-5 w-5" />
                                                    <span>Clear Recent Projects & Photos</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
