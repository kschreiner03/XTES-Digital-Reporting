
import React, { useState } from 'react';

export const SpecialCharacterPalette: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [copiedChar, setCopiedChar] = useState<string | null>(null);

    const characters = ['°', '±', 'µ', 'α', 'β', 'γ', 'δ', 'ε', 'θ', 'λ', 'π', 'ρ', 'σ', 'τ', 'φ', 'ω', 'Ω', '≤', '≥', '≠', '≈', '√', '¹', '²', '³', '→', '←', '↑', '↓'];

    const handleCharClick = (char: string) => {
        navigator.clipboard.writeText(char).then(() => {
            setCopiedChar(char);
            setTimeout(() => setCopiedChar(null), 1500);
        }).catch(err => {
            console.error('Failed to copy character: ', err);
        });
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed top-1/2 right-0 -translate-y-1/2 bg-[#007D8C] text-white p-2 rounded-l-md shadow-lg z-50 hover:bg-[#006b7a] transition-colors"
                style={{ writingMode: 'vertical-rl' }}
                aria-label="Open special character palette"
            >
                <span className="font-bold text-lg transform rotate-180">Symbols</span>
            </button>
        );
    }

    return (
        <div className="fixed top-1/2 right-0 -translate-y-1/2 bg-white dark:bg-gray-800 p-4 rounded-l-lg shadow-xl z-50 border-l-2 border-t-2 border-b-2 border-gray-200 dark:border-gray-600 w-64 transition-colors duration-200">
            <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold text-gray-700 dark:text-gray-200">Special Characters</h3>
                <button
                    onClick={() => setIsOpen(false)}
                    className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100"
                    aria-label="Close special character palette"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10.293 15.707a1 1 0 010-1.414L14.586 10l-4.293-4.293a1 1 0 111.414-1.414l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0z" clipRule="evenodd" /><path fillRule="evenodd" d="M4.293 15.707a1 1 0 010-1.414L8.586 10 4.293 5.707a1 1 0 011.414-1.414l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                </button>
            </div>
            <div className="grid grid-cols-6 gap-1">
                {characters.map(char => (
                    <div key={char} className="relative">
                        <button
                            onClick={() => handleCharClick(char)}
                            className="w-8 h-8 flex items-center justify-center text-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white rounded-md transition-colors"
                            title={`Copy character: ${char}`}
                        >
                            {char}
                        </button>
                        {copiedChar === char && (
                            <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs font-bold px-2 py-1 rounded-md shadow-lg animate-fade-out z-10">
                                Copied!
                            </div>
                        )}
                    </div>
                ))}
            </div>
             <style>{`
                @keyframes fade-out {
                    0% { opacity: 1; transform: translate(-50%, 0); }
                    80% { opacity: 1; transform: translate(-50%, 0); }
                    100% { opacity: 0; transform: translate(-50%, -10px); }
                }
                .animate-fade-out {
                    animation: fade-out 1.5s forwards;
                }
            `}</style>
        </div>
    );
};
