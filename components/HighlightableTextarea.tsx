import React, { useRef, useLayoutEffect, useState } from 'react';
import type { TextHighlight } from '../types';

interface HighlightableTextareaProps {
    label: string;
    value: string;
    highlights?: TextHighlight[];
    onChange: (value: string) => void;
    onHighlightsChange?: (highlights: TextHighlight[]) => void;
    isInvalid?: boolean;
    placeholder?: string;
}

const HIGHLIGHT_COLORS = [
    { name: 'Yellow', value: '#FFFF00', light: 'bg-yellow-200' },
    { name: 'Green', value: '#90EE90', light: 'bg-green-200' },
    { name: 'Blue', value: '#ADD8E6', light: 'bg-blue-200' },
    { name: 'Pink', value: '#FFB6C1', light: 'bg-pink-200' },
    { name: 'Orange', value: '#FFD700', light: 'bg-orange-200' },
];

const HighlightableTextarea: React.FC<HighlightableTextareaProps> = ({
    label,
    value,
    highlights = [],
    onChange,
    onHighlightsChange,
    isInvalid = false,
    placeholder = '',
}) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [selectedColor, setSelectedColor] = useState<string>(HIGHLIGHT_COLORS[0].value);
    const [showColorPicker, setShowColorPicker] = useState(false);

    useLayoutEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'inherit';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [value]);

    const applyHighlight = () => {
        if (!textareaRef.current) return;
        const start = textareaRef.current.selectionStart;
        const end = textareaRef.current.selectionEnd;

        if (start === end) return; // No text selected

        const newHighlight: TextHighlight = { start, end, color: selectedColor };
        const updatedHighlights = highlights.filter(h => !(h.start < end && h.end > start)); // Remove overlapping
        updatedHighlights.push(newHighlight);
        updatedHighlights.sort((a, b) => a.start - b.start);

        onHighlightsChange?.(updatedHighlights);
        textareaRef.current.setSelectionRange(end, end);
    };

    const removeHighlight = (index: number) => {
        const updated = highlights.filter((_, i) => i !== index);
        onHighlightsChange?.(updated);
    };

    const clearAllHighlights = () => {
        onHighlightsChange?.([]);
    };

    // Build highlighted text display
    const buildHighlightedContent = () => {
        const segments: React.ReactNode[] = [];
        let lastEnd = 0;

        for (const highlight of highlights) {
            if (highlight.start > lastEnd) {
                segments.push(
                    <span key={`text-${lastEnd}`}>
                        {value.substring(lastEnd, highlight.start)}
                    </span>
                );
            }

            segments.push(
                <span
                    key={`highlight-${highlight.start}`}
                    style={{ backgroundColor: highlight.color, opacity: 0.4 }}
                    className="cursor-pointer"
                    onClick={() => {
                        const idx = highlights.indexOf(highlight);
                        removeHighlight(idx);
                    }}
                    title="Click to remove highlight"
                >
                    {value.substring(highlight.start, highlight.end)}
                </span>
            );

            lastEnd = highlight.end;
        }

        if (lastEnd < value.length) {
            segments.push(
                <span key={`text-${lastEnd}`}>
                    {value.substring(lastEnd)}
                </span>
            );
        }

        return segments;
    };

    return (
        <div className="space-y-2">
            <label className="text-base font-bold text-black dark:text-gray-200">{label}:</label>

            {/* Toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
                <button
                    onClick={applyHighlight}
                    className="px-3 py-1 bg-yellow-300 hover:bg-yellow-400 rounded text-xs font-semibold text-black transition"
                    title="Highlight selected text"
                >
                    Highlight
                </button>

                <div className="relative">
                    <button
                        onClick={() => setShowColorPicker(!showColorPicker)}
                        className="px-2 py-1 border border-gray-400 dark:border-gray-600 rounded text-xs flex items-center gap-1"
                    >
                        <div
                            className="w-4 h-4 rounded border"
                            style={{ backgroundColor: selectedColor }}
                        />
                        Color
                    </button>

                    {showColorPicker && (
                        <div className="absolute top-8 left-0 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded shadow-lg p-2 z-10 flex flex-col gap-1">
                            {HIGHLIGHT_COLORS.map(color => (
                                <button
                                    key={color.value}
                                    onClick={() => {
                                        setSelectedColor(color.value);
                                        setShowColorPicker(false);
                                    }}
                                    className={`px-3 py-1 rounded text-xs flex items-center gap-2 transition ${
                                        selectedColor === color.value
                                            ? 'ring-2 ring-blue-500'
                                            : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    <div
                                        className="w-4 h-4 rounded border"
                                        style={{ backgroundColor: color.value }}
                                    />
                                    {color.name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {highlights.length > 0 && (
                    <button
                        onClick={clearAllHighlights}
                        className="px-3 py-1 bg-red-300 hover:bg-red-400 rounded text-xs font-semibold text-black transition"
                    >
                        Clear All ({highlights.length})
                    </button>
                )}
            </div>

            {/* Textarea with highlight overlay */}
            <div className="relative">
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    rows={4}
                    className={`p-2 w-full border-b-2 focus:outline-none focus:border-[#007D8C] transition duration-200 bg-transparent text-base font-normal text-black dark:text-gray-100 min-w-0 resize-none overflow-hidden relative z-10 ${
                        isInvalid ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                    }`}
                    placeholder={placeholder}
                    spellCheck={true}
                />

                {/* Highlight display layer (behind textarea) */}
                {highlights.length > 0 && (
                    <div
                        className="absolute top-2 left-2 w-full text-base font-normal text-transparent pointer-events-none whitespace-pre-wrap break-words"
                        style={{ maxWidth: 'calc(100% - 1rem)' }}
                    >
                        {buildHighlightedContent()}
                    </div>
                )}
            </div>

            {/* Highlights summary */}
            {highlights.length > 0 && (
                <div className="text-xs text-gray-600 dark:text-gray-400 max-h-20 overflow-y-auto">
                    <p className="font-semibold mb-1">Highlights ({highlights.length}):</p>
                    {highlights.map((h, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 py-1 px-2 bg-gray-100 dark:bg-gray-700 rounded mb-1">
                            <span className="truncate">
                                <span
                                    className="inline-block w-3 h-3 rounded mr-1"
                                    style={{ backgroundColor: h.color }}
                                />
                                "{value.substring(h.start, h.end)}"
                            </span>
                            <button
                                onClick={() => removeHighlight(i)}
                                className="text-red-500 hover:text-red-700 font-bold"
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default HighlightableTextarea;
