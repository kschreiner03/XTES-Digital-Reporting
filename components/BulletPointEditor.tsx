import React, { useRef } from 'react';

interface BulletPointEditorProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    rows?: number;
    placeholder?: string;
    isInvalid?: boolean;
}

const BulletPointEditor: React.FC<BulletPointEditorProps> = ({ label, value, onChange, placeholder, rows = 3, isInvalid = false }) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const textarea = e.currentTarget;
        const { selectionStart, selectionEnd, value: text } = textarea;
        
        // Find the boundaries of the line the cursor is currently on
        const lineStartIndex = text.lastIndexOf('\n', selectionStart - 1) + 1;
        let lineEndIndex = text.indexOf('\n', selectionStart);
        if (lineEndIndex === -1) lineEndIndex = text.length;

        const currentLine = text.substring(lineStartIndex, lineEndIndex);
        
        if (e.key === 'Tab') {
            e.preventDefault();
            
            if (e.shiftKey) { // Outdent
                if (currentLine.startsWith('  ')) {
                    // Remove two spaces from the start of the line
                    const newText = text.substring(0, lineStartIndex) + text.substring(lineStartIndex + 2);
                    onChange(newText);
                    // After state update, restore cursor position
                    setTimeout(() => {
                        textarea.selectionStart = Math.max(lineStartIndex, selectionStart - 2);
                        textarea.selectionEnd = Math.max(lineStartIndex, selectionEnd - 2);
                    }, 0);
                }
            } else { // Indent
                // Add two spaces to the start of the line
                const newText = text.substring(0, lineStartIndex) + '  ' + text.substring(lineStartIndex);
                onChange(newText);
                // After state update, restore cursor position
                setTimeout(() => {
                    textarea.selectionStart = selectionStart + 2;
                    textarea.selectionEnd = selectionEnd + 2;
                }, 0);
            }

        } else if (e.key === 'Enter') {
            e.preventDefault();

            const indentMatch = currentLine.match(/^\s*/);
            const currentIndent = indentMatch ? indentMatch[0] : '';

            // If the current line is an empty bullet, outdent or create a paragraph break
            if (currentLine.trim() === '-') {
                if (currentIndent.length >= 2) { // Outdent
                    const newIndent = currentIndent.substring(0, currentIndent.length - 2);
                    const newText = text.substring(0, lineStartIndex) + newIndent + '- ' + text.substring(lineEndIndex);
                    onChange(newText);
                    setTimeout(() => {
                        const newCursorPos = lineStartIndex + newIndent.length + 2; // after '- '
                        textarea.selectionStart = textarea.selectionEnd = newCursorPos;
                    }, 0);
                } else { // Create paragraph break
                    const newText = text.substring(0, lineStartIndex) + text.substring(lineEndIndex);
                    onChange(newText);
                    setTimeout(() => {
                        textarea.selectionStart = textarea.selectionEnd = lineStartIndex;
                    }, 0);
                }
            } else { // If the line has content, create a new bullet with the same indentation
                const newLine = '\n' + currentIndent + '- ';
                const newText = text.substring(0, selectionStart) + newLine + text.substring(selectionEnd);
                onChange(newText);
                setTimeout(() => {
                    textarea.selectionStart = textarea.selectionEnd = selectionStart + newLine.length;
                }, 0);
            }
        }
    };
    
    const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
        if (e.currentTarget.value.trim() === '') {
            onChange('- ');
        }
    };

    return (
        <div>
            {label && <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>}
            <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onFocus={handleFocus}
                onKeyDown={handleKeyDown}
                rows={rows}
                placeholder={placeholder}
                className={`block w-full p-2 border rounded-md shadow-sm focus:ring-2 focus:ring-[#007D8C] focus:border-[#007D8C] transition bg-white dark:bg-gray-700 text-black dark:text-white dark:placeholder-gray-400 ${isInvalid ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
                spellCheck={true}
            />
        </div>
    );
};

export default BulletPointEditor;

