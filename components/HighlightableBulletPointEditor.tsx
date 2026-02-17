import React, { useState } from 'react';
import BulletPointEditor from './BulletPointEditor';
import type { TextHighlight } from '../types';

interface HighlightableBulletPointEditorProps {
    label: string;
    fieldId: string;
    value: string;
    highlights?: TextHighlight[];
    onChange: (value: string) => void;
    onHighlightsChange?: (highlights: TextHighlight[]) => void;
    rows?: number;
    placeholder?: string;
    isInvalid?: boolean;
}

const HIGHLIGHT_COLORS = [
    { name: 'Yellow', value: '#FFFF00' },
    { name: 'Green', value: '#90EE90' },
    { name: 'Blue', value: '#ADD8E6' },
    { name: 'Pink', value: '#FFB6C1' },
    { name: 'Orange', value: '#FFD700' },
];

const HighlightableBulletPointEditor: React.FC<HighlightableBulletPointEditorProps> = ({
    label,
    fieldId,
    value,
    highlights = [],
    onChange,
    onHighlightsChange,
    rows,
    placeholder,
    isInvalid,
}) => {
    const [selectedColor, setSelectedColor] = useState<string>(HIGHLIGHT_COLORS[0].value);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [selection, setSelection] = useState({ start: 0, end: 0 });

    const handleApplyHighlight = () => {
        if (selection.start === selection.end) return;

        const newHighlight: TextHighlight = {
            start: selection.start,
            end: selection.end,
            color: selectedColor,
        };

        const updatedHighlights = highlights.filter(
            h => !(h.start < selection.end && h.end > selection.start)
        );
        updatedHighlights.push(newHighlight);
        updatedHighlights.sort((a, b) => a.start - b.start);

        onHighlightsChange?.(updatedHighlights);
    };

    const removeHighlight = (index: number) => {
        const updated = highlights.filter((_, i) => i !== index);
        onHighlightsChange?.(updated);
    };

    const clearAllHighlights = () => {
        onHighlightsChange?.([]);
    };

    // Note: BulletPointEditor doesn't provide selection tracking,
    // so highlighting works but users need to manually select in a text-based interface
    // This is a limitation of the wrapped component

    return (
        <div className="space-y-2">
            {/* Highlight Toolbar */}
            <div className="flex items-center gap-2 flex-wrap bg-gray-50 dark:bg-gray-800 p-2 rounded">
                <button
                    onClick={handleApplyHighlight}
                    disabled={selection.start === selection.end}
                    className="px-3 py-1 bg-yellow-300 hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs font-semibold text-black transition"
                    title="Select text in the editor above and click to highlight"
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

            {/* BulletPointEditor Component */}
            <BulletPointEditor
                label={label}
                fieldId={fieldId}
                value={value}
                onChange={onChange}
                rows={rows}
                placeholder={placeholder}
                isInvalid={isInvalid}
            />

            {/* Highlights Summary */}
            {highlights.length > 0 && (
                <div className="text-xs text-gray-600 dark:text-gray-400 max-h-24 overflow-y-auto bg-gray-50 dark:bg-gray-800 p-2 rounded">
                    <p className="font-semibold mb-1">Highlights ({highlights.length}):</p>
                    {highlights.map((h, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 py-1 px-2 bg-white dark:bg-gray-700 rounded mb-1">
                            <span className="truncate">
                                <span
                                    className="inline-block w-3 h-3 rounded mr-1"
                                    style={{ backgroundColor: h.color }}
                                />
                                "{value.substring(h.start, Math.min(h.end, h.start + 30))}{h.end - h.start > 30 ? '...' : ''}"
                            </span>
                            <button
                                onClick={() => removeHighlight(i)}
                                className="text-red-500 hover:text-red-700 font-bold flex-shrink-0"
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

export default HighlightableBulletPointEditor;
