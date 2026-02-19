import React from 'react';
import { CloseIcon } from './icons';

const APP_VERSION = '1.1.4-beta';
const LAST_SEEN_VERSION_KEY = 'xtec_last_seen_version';

interface ReleaseNote {
    version: string;
    date: string;
    highlights: string[];
}

const RELEASE_NOTES: ReleaseNote[] = [
    {
        version: '1.1.4-beta',
        date: 'February 17, 2026',
        highlights: [
            'Six theme options — Light, Dark, Grey, Sepia (Warm), Blue (Cool), and High Contrast',
            'Preset wallpapers for the landing page background — choose from 10 built-in photos',
            'Custom landing page background with drag-to-crop and zoom controls',
            'Default values for Proponent and Monitor Name auto-fill new reports',
            'Spell check language selection with 12 language options',
            '"What\'s New" popup on first launch after an update',
            'Updated Help SOP with documentation for all new features',
        ],
    },
    {
        version: '1.1.4',
        date: 'November 15, 2025',
        highlights: [
            'Inline comments — select text to add anchored comments with replies and resolution',
            'Text highlighting with 5 colors (Yellow, Green, Blue, Pink, Orange)',
            'Drag-to-reorder photos using grip handles',
            'Project thumbnail previews on hover in Recent Projects',
            'Auto-fill photo Date and Location from report header fields',
            'Combined Log report type for merging photos from multiple projects',
            'Special character palette with Greek letters and math symbols',
            'Full-screen image viewer with file metadata',
        ],
    },
];

/**
 * Only show What's New after an actual update has completed —
 * i.e. when a previous version was stored and differs from the current one.
 * On a fresh install (no stored version) we skip the popup and just record the version.
 */
export function shouldShowWhatsNew(): boolean {
    const lastSeen = localStorage.getItem(LAST_SEEN_VERSION_KEY);
    if (lastSeen === null) {
        // First install — store the version silently, don't show popup
        localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION);
        return false;
    }
    return lastSeen !== APP_VERSION;
}

export function dismissWhatsNew(): void {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION);
}

interface WhatsNewModalProps {
    onClose: () => void;
}

const WhatsNewModal: React.FC<WhatsNewModalProps> = ({ onClose }) => {
    const handleClose = () => {
        dismissWhatsNew();
        onClose();
    };

    // Only show notes for the current version
    const currentRelease = RELEASE_NOTES.find(r => r.version === APP_VERSION);

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={handleClose}>
            <div
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 pt-6 pb-4 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">What's New</h2>
                        {currentRelease && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">v{currentRelease.version} — {currentRelease.date}</p>
                        )}
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        <CloseIcon className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="px-6 py-4 overflow-y-auto flex-1">
                    {currentRelease ? (
                        <ul className="space-y-2">
                            {currentRelease.highlights.map((item, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                                    <span className="text-[#007D8C] mt-0.5 flex-shrink-0">&#x2022;</span>
                                    {item}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400">This update includes bug fixes and improvements.</p>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                        onClick={handleClose}
                        className="w-full bg-[#007D8C] hover:bg-[#006670] text-white font-semibold py-2.5 px-4 rounded-lg transition-colors"
                    >
                        Got it
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WhatsNewModal;
