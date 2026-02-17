
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CloseIcon, TrashIcon } from './icons';
import { clearDatabase } from './db';
import { useTheme } from './ThemeContext';
import SafeImage, { getAssetUrl } from './SafeImage';

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

const LANDING_PHOTO_KEY = 'xtec_landing_photo';
const LANDING_PHOTO_POS_KEY = 'xtec_landing_photo_position';
const LANDING_PHOTO_ZOOM_KEY = 'xtec_landing_photo_zoom';
const LANDING_PHOTO_PRESET_KEY = 'xtec_landing_photo_preset';

// Crop viewport height matches the landing page header aspect ratio
const CROP_VIEWPORT_HEIGHT = 120;

interface PresetWallpaper {
    fileName: string;
    label: string;
    defaultPosition: number; // cropPct default
}

const PRESET_WALLPAPERS: PresetWallpaper[] = [
    { fileName: 'landscape.JPG', label: 'Oil Field', defaultPosition: 85 },
    { fileName: 'bison1.jpg', label: 'Bison', defaultPosition: 60 },
    { fileName: 'wallpaper/116911439_10223823748248481_4788712539515562122_o - Copy.jpg', label: 'Lake Sunset', defaultPosition: 40 },
    { fileName: 'wallpaper/bison rock - Copy.jpg', label: 'Prairie', defaultPosition: 50 },
    { fileName: 'wallpaper/Breeding Bird Surveys_CL.jpg', label: 'Yellow Warbler', defaultPosition: 50 },
    { fileName: 'wallpaper/common nighthawk - Copy.JPG', label: 'Nighthawk', defaultPosition: 50 },
    { fileName: 'wallpaper/DJI_0041.JPG', label: 'Aerial', defaultPosition: 50 },

    { fileName: 'wallpaper/IMG_0009_CL.jpg', label: 'Wildflowers', defaultPosition: 50 },
    { fileName: 'wallpaper/IMG_0283.JPG', label: 'Sinkhole', defaultPosition: 40 },
    { fileName: 'wallpaper/Owl.jpg', label: 'Great Grey Owl', defaultPosition: 50 },
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
    const [hasCustomPhoto, setHasCustomPhoto] = useState(false);
    const [customPhotoPreview, setCustomPhotoPreview] = useState<string | null>(null);
    const [selectedPreset, setSelectedPreset] = useState<string | null>(null); // preset fileName or null
    const [activePresetUrl, setActivePresetUrl] = useState<string | null>(null);
    const [photoPosition, setPhotoPosition] = useState('center 85%');
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStartY, setDragStartY] = useState(0);
    const [dragStartPct, setDragStartPct] = useState(85);
    const [cropPct, setCropPct] = useState(85); // 0-100, vertical position percentage
    const [cropZoom, setCropZoom] = useState(1.0); // 0.5 to 3.0
    const [imgNatDims, setImgNatDims] = useState({ w: 0, h: 0 });
    const cropContainerRef = useRef<HTMLDivElement>(null);
    const cropImgRef = useRef<HTMLImageElement>(null);
    const { theme, setTheme } = useTheme();

    // The active preview image: custom upload data URL, or resolved preset URL
    const activePreviewSrc = customPhotoPreview || activePresetUrl;
    const hasActivePhoto = hasCustomPhoto || !!selectedPreset;

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

        // Load custom landing photo state
        const savedPreset = localStorage.getItem(LANDING_PHOTO_PRESET_KEY);
        const savedPhoto = localStorage.getItem(LANDING_PHOTO_KEY);
        if (savedPreset) {
            setSelectedPreset(savedPreset);
            getAssetUrl(savedPreset).then(url => setActivePresetUrl(url));
        } else if (savedPhoto) {
            setHasCustomPhoto(true);
            setCustomPhotoPreview(savedPhoto);
        }
        const savedPos = localStorage.getItem(LANDING_PHOTO_POS_KEY);
        if (savedPos) {
            setPhotoPosition(savedPos);
            // Parse percentage from "center XX%" format
            const match = savedPos.match(/(\d+)%/);
            if (match) setCropPct(parseInt(match[1], 10));
        }
        const savedZoom = localStorage.getItem(LANDING_PHOTO_ZOOM_KEY);
        if (savedZoom) setCropZoom(parseFloat(savedZoom));

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

    const handleLandingPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file.');
            return;
        }
        setIsUploadingPhoto(true);
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
                    try {
                        localStorage.setItem(LANDING_PHOTO_KEY, dataUrl);
                        localStorage.removeItem(LANDING_PHOTO_PRESET_KEY);
                        setHasCustomPhoto(true);
                        setCustomPhotoPreview(dataUrl);
                        setSelectedPreset(null);
                        setActivePresetUrl(null);
                        setImgNatDims({ w: 0, h: 0 });
                    } catch {
                        alert('Image is too large to store. Please try a smaller image.');
                    }
                }
                setIsUploadingPhoto(false);
            };
            img.src = reader.result as string;
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleRemoveLandingPhoto = () => {
        localStorage.removeItem(LANDING_PHOTO_KEY);
        localStorage.removeItem(LANDING_PHOTO_POS_KEY);
        localStorage.removeItem(LANDING_PHOTO_ZOOM_KEY);
        localStorage.removeItem(LANDING_PHOTO_PRESET_KEY);
        setHasCustomPhoto(false);
        setCustomPhotoPreview(null);
        setSelectedPreset(null);
        setActivePresetUrl(null);
        setPhotoPosition('center 85%');
    };

    const handleSelectPreset = (preset: PresetWallpaper) => {
        // Clear custom photo if any
        localStorage.removeItem(LANDING_PHOTO_KEY);
        setHasCustomPhoto(false);
        setCustomPhotoPreview(null);
        // Set the preset and resolve its URL for the crop viewport
        setSelectedPreset(preset.fileName);
        getAssetUrl(preset.fileName).then(url => setActivePresetUrl(url));
        setImgNatDims({ w: 0, h: 0 }); // Reset so onLoad re-measures
        // Apply default crop position for this preset
        setCropPct(preset.defaultPosition);
        setCropZoom(1.0);
        // Save immediately
        const pos = `center ${preset.defaultPosition}%`;
        setPhotoPosition(pos);
        localStorage.setItem(LANDING_PHOTO_PRESET_KEY, preset.fileName);
        localStorage.setItem(LANDING_PHOTO_POS_KEY, pos);
        localStorage.setItem(LANDING_PHOTO_ZOOM_KEY, '1.00');
        window.dispatchEvent(new CustomEvent('xtec-bg-photo-changed'));
    };

    // Compute the "cover" base dimensions — minimum size to fill the container
    const getCoverDims = useCallback((cW: number, cH: number) => {
        if (!imgNatDims.w || !imgNatDims.h) return { w: cW, h: cH };
        const imgAspect = imgNatDims.w / imgNatDims.h;
        const containerAspect = cW / cH;
        if (imgAspect > containerAspect) {
            // Image is proportionally wider → match height
            return { w: cH * imgAspect, h: cH };
        } else {
            // Image is proportionally taller → match width
            return { w: cW, h: cW / imgAspect };
        }
    }, [imgNatDims]);

    // Compute the image display style for the crop preview
    const getCropImgStyle = useCallback((): React.CSSProperties => {
        if (!imgNatDims.w || !cropContainerRef.current) {
            // Fallback before dimensions known
            return { width: '100%', height: CROP_VIEWPORT_HEIGHT, objectFit: 'cover' as const };
        }
        const cW = cropContainerRef.current.clientWidth;
        const cH = CROP_VIEWPORT_HEIGHT;
        const base = getCoverDims(cW, cH);
        const dW = base.w * cropZoom;
        const dH = base.h * cropZoom;
        const overflowY = dH - cH;
        return {
            position: 'absolute' as const,
            width: dW,
            height: dH,
            left: (cW - dW) / 2,
            top: overflowY > 0 ? -(cropPct / 100) * overflowY : (cH - dH) / 2,
        };
    }, [imgNatDims, cropZoom, cropPct, getCoverDims]);

    const handleCropMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
        setDragStartY(e.clientY);
        setDragStartPct(cropPct);
    }, [cropPct]);

    useEffect(() => {
        if (!isDragging) return;
        const handleMouseMove = (e: MouseEvent) => {
            if (!cropContainerRef.current) return;
            const cW = cropContainerRef.current.clientWidth;
            const cH = CROP_VIEWPORT_HEIGHT;
            const base = getCoverDims(cW, cH);
            const overflow = base.h * cropZoom - cH;
            if (overflow <= 0) return;
            const deltaY = e.clientY - dragStartY;
            const deltaPct = (deltaY / overflow) * 100;
            const newPct = Math.max(0, Math.min(100, dragStartPct + deltaPct));
            setCropPct(newPct);
        };
        const handleMouseUp = () => {
            setIsDragging(false);
        };
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragStartY, dragStartPct, cropZoom, getCoverDims]);

    const handleSetPhoto = () => {
        const pos = `center ${Math.round(cropPct)}%`;
        setPhotoPosition(pos);
        localStorage.setItem(LANDING_PHOTO_POS_KEY, pos);
        localStorage.setItem(LANDING_PHOTO_ZOOM_KEY, cropZoom.toFixed(2));
        if (selectedPreset) {
            localStorage.setItem(LANDING_PHOTO_PRESET_KEY, selectedPreset);
            localStorage.removeItem(LANDING_PHOTO_KEY);
        }
        window.dispatchEvent(new CustomEvent('xtec-bg-photo-changed'));
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
                                            <span className="block text-base font-medium text-gray-700 dark:text-gray-300">Theme</span>
                                            <span className="text-sm text-gray-500 dark:text-gray-400">Choose your preferred appearance.</span>
                                        </div>
                                        <select
                                            value={theme}
                                            onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'grey' | 'sepia' | 'blue' | 'high-contrast')}
                                            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#007D8C]"
                                        >
                                            <option value="light">Light</option>
                                            <option value="dark">Dark</option>
                                            <option value="grey">Grey</option>
                                            <option value="sepia">Sepia (Warm)</option>
                                            <option value="blue">Blue (Cool)</option>
                                            <option value="high-contrast">High Contrast</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4 border-b dark:border-gray-700 pb-2">Landing Page Background</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                                        Choose a preset wallpaper or upload your own photo.
                                    </p>

                                    {/* Preset wallpaper grid */}
                                    <div className="grid grid-cols-5 gap-2 mb-3">
                                        {PRESET_WALLPAPERS.map((preset) => {
                                            const isSelected = selectedPreset === preset.fileName && !hasCustomPhoto;
                                            return (
                                                <button
                                                    key={preset.fileName}
                                                    onClick={() => handleSelectPreset(preset)}
                                                    className={`relative rounded-lg overflow-hidden border-2 transition-all duration-150 group focus:outline-none ${
                                                        isSelected
                                                            ? 'border-[#007D8C] ring-1 ring-[#007D8C]/30'
                                                            : 'border-gray-200 dark:border-gray-600 hover:border-[#007D8C]/40'
                                                    }`}
                                                    style={{ aspectRatio: '16/9' }}
                                                    title={preset.label}
                                                >
                                                    <SafeImage
                                                        fileName={preset.fileName}
                                                        alt={preset.label}
                                                        className="w-full h-full object-cover"
                                                        draggable={false}
                                                    />
                                                    <div className={`absolute inset-0 flex items-end justify-center pb-1 bg-gradient-to-t from-black/50 to-transparent ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                                                        <span className="text-[10px] font-medium text-white drop-shadow-sm">{preset.label}</span>
                                                    </div>
                                                    {isSelected && (
                                                        <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#007D8C] flex items-center justify-center">
                                                            <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                            </svg>
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Crop viewport */}
                                    <div
                                        ref={cropContainerRef}
                                        className={`mb-3 rounded-lg overflow-hidden border-2 bg-black relative select-none ${
                                            activePreviewSrc
                                                ? 'border-[#007D8C]/50 cursor-grab active:cursor-grabbing'
                                                : 'border-gray-200 dark:border-gray-600'
                                        }`}
                                        style={{ height: CROP_VIEWPORT_HEIGHT }}
                                        onMouseDown={activePreviewSrc ? handleCropMouseDown : undefined}
                                    >
                                        {activePreviewSrc ? (
                                            <>
                                                {/* Blurred fill layer — always covers, fills gaps when zoomed out */}
                                                <img
                                                    src={activePreviewSrc}
                                                    alt=""
                                                    aria-hidden="true"
                                                    className="absolute inset-0 w-full object-cover pointer-events-none"
                                                    style={{
                                                        height: CROP_VIEWPORT_HEIGHT,
                                                        filter: 'blur(20px)',
                                                        transform: 'scale(1.15)',
                                                        opacity: 0.5,
                                                    }}
                                                    draggable={false}
                                                />
                                                {/* Main image — explicitly sized, no object-fit */}
                                                <img
                                                    ref={cropImgRef}
                                                    src={activePreviewSrc}
                                                    alt="Drag to position"
                                                    className="pointer-events-none"
                                                    style={getCropImgStyle()}
                                                    draggable={false}
                                                    onLoad={(e) => {
                                                        const img = e.currentTarget;
                                                        setImgNatDims({ w: img.naturalWidth, h: img.naturalHeight });
                                                    }}
                                                />
                                                {/* Drag hint overlay */}
                                                {!isDragging && (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
                                                        <div className="bg-black/60 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5">
                                                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5-3L16.5 18m0 0L12 13.5M16.5 18V4.5" />
                                                            </svg>
                                                            Drag to reposition
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <div className="w-full h-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                                                <span className="text-sm text-gray-400 dark:text-gray-500">Select a preset or upload a photo</span>
                                            </div>
                                        )}
                                    </div>

                                    {hasActivePhoto && activePreviewSrc && (
                                        <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">Tip: Drag on the photo to adjust position</p>
                                    )}

                                    {/* Zoom slider */}
                                    {hasActivePhoto && activePreviewSrc && (
                                        <div className="mb-3 flex items-center gap-3">
                                            <svg className="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM13.5 10.5h-6" />
                                            </svg>
                                            <input
                                                type="range"
                                                min="0.5"
                                                max="3"
                                                step="0.05"
                                                value={cropZoom}
                                                onChange={(e) => setCropZoom(parseFloat(e.target.value))}
                                                className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full appearance-none cursor-pointer accent-[#007D8C]"
                                            />
                                            <svg className="h-5 w-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
                                            </svg>
                                            <span className="text-xs text-gray-400 w-10 text-right">{Math.round(cropZoom * 100)}%</span>
                                        </div>
                                    )}

                                    {/* Upload / Set / Reset buttons */}
                                    <div className="flex items-center gap-3">
                                        <label className={`${isUploadingPhoto ? 'opacity-50 pointer-events-none' : ''} bg-[#007D8C] hover:bg-[#006b7a] text-white font-medium py-2 px-4 rounded-lg cursor-pointer transition-colors text-sm inline-flex items-center gap-2`}>
                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                                            </svg>
                                            {isUploadingPhoto ? 'Processing...' : hasCustomPhoto ? 'Change Photo' : 'Upload Photo'}
                                            <input type="file" accept="image/*" onChange={handleLandingPhotoUpload} className="hidden" disabled={isUploadingPhoto} />
                                        </label>
                                        {hasActivePhoto && (
                                            <button
                                                onClick={handleSetPhoto}
                                                className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium py-2 px-4 rounded-lg transition-colors text-sm inline-flex items-center gap-1.5"
                                            >
                                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                </svg>
                                                Set
                                            </button>
                                        )}
                                        {hasActivePhoto && (
                                            <button
                                                onClick={() => {
                                                    handleRemoveLandingPhoto();
                                                    setCropPct(85);
                                                    setCropZoom(1.0);
                                                    window.dispatchEvent(new CustomEvent('xtec-bg-photo-changed'));
                                                }}
                                                className="text-sm text-red-500 hover:text-red-600 font-medium transition-colors"
                                            >
                                                Reset to Default
                                            </button>
                                        )}
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
