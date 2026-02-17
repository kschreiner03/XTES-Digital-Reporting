import React, { useState } from 'react';
import type { TextComment } from '../types';

/* ============================================================
   PAGE COMMENTS PANEL - Google Docs-style comments rail

   This component renders at the page level, OUTSIDE the content
   container. It displays all comments from all fields in a single
   panel fixed to the right edge of the viewport.

   The content container shifts left (using transform) when this
   panel is visible, maintaining fixed content width.
   ============================================================ */

// Get Windows username
const getCurrentUsername = () => {
    try {
        if (typeof window === 'undefined') return 'User';
        const electronAPI = (window as any).electronAPI;
        if (electronAPI?.getUserInfo) {
            const userInfo = electronAPI.getUserInfo();
            if (userInfo?.username) {
                return userInfo.username;
            }
        }
    } catch (error) {
        console.error('Error getting username:', error);
    }
    return 'User';
};

export interface FieldComment extends TextComment {
    fieldId: string;
    fieldLabel: string;
}

interface PageCommentsPanelProps {
    comments: FieldComment[];
    isCollapsed: boolean;
    onToggleCollapsed: () => void;
    onDeleteComment: (fieldId: string, commentId: string) => void;
    onResolveComment: (fieldId: string, commentId: string) => void;
    onUpdateComment: (fieldId: string, commentId: string, newText: string) => void;
}

// Comment colors
const commentBorderColors = [
    '#2196F3', '#4CAF50', '#FF9800', '#E91E63',
    '#9C27B0', '#009688', '#FFC107', '#F44336',
];

const commentBgColors = [
    '#E3F2FD', '#E8F5E9', '#FFF3E0', '#FCE4EC',
    '#F3E5F5', '#E0F2F1', '#FFF9C4', '#FFEBEE',
];

const getColorIndex = (id: string): number => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = ((hash << 5) - hash) + id.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash) % commentBorderColors.length;
};

const formatTimestamp = (date: Date): string => {
    const now = new Date();
    const commentDate = new Date(date);
    const diffMs = now.getTime() - commentDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return commentDate.toLocaleDateString();
};

const PageCommentsPanel: React.FC<PageCommentsPanelProps> = ({
    comments,
    isCollapsed,
    onToggleCollapsed,
    onDeleteComment,
    onResolveComment,
    onUpdateComment,
}) => {
    const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editingText, setEditingText] = useState('');
    const currentUsername = getCurrentUsername();

    const activeComments = comments.filter(c => !c.resolved);
    const resolvedComments = comments.filter(c => c.resolved);

    const handleStartEdit = (comment: FieldComment) => {
        setEditingCommentId(comment.id);
        setEditingText(comment.text);
    };

    const handleSaveEdit = (comment: FieldComment) => {
        if (editingText.trim()) {
            onUpdateComment(comment.fieldId, comment.id, editingText.trim());
        }
        setEditingCommentId(null);
        setEditingText('');
    };

    const handleCancelEdit = () => {
        setEditingCommentId(null);
        setEditingText('');
    };

    if (comments.length === 0) return null;

    return (
        <div
            className={`fixed right-0 top-1/2 -translate-y-1/2 z-50 transition-all duration-300 ease-out ${
                isCollapsed ? 'w-8' : 'w-80'
            }`}
        >
            {isCollapsed ? (
                /* Collapsed state - slim tab flush with right edge */
                <button
                    onClick={onToggleCollapsed}
                    className="w-8 min-h-[100px] flex flex-col items-center justify-center gap-2 bg-white dark:bg-gray-800 rounded-l-lg border-l border-t border-b border-gray-200 dark:border-gray-600 shadow-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    title="Expand comments"
                >
                    <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    <span
                        className="text-xs font-medium text-gray-500 dark:text-gray-400"
                        style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                    >
                        {comments.length}
                    </span>
                </button>
            ) : (
                /* Expanded state - full comments panel */
                <div className="flex flex-col bg-white dark:bg-gray-800 rounded-l-lg border-l border-t border-b border-gray-200 dark:border-gray-600 shadow-xl max-h-[70vh]">
                    {/* Header */}
                    <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-600 flex-shrink-0">
                        <div>
                            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Comments</span>
                            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                                {activeComments.length} active
                            </span>
                        </div>
                        <button
                            onClick={onToggleCollapsed}
                            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            title="Collapse comments"
                        >
                            <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </button>
                    </div>

                    {/* Comments list */}
                    <div className="overflow-y-auto flex-1 p-3 space-y-3">
                        {activeComments.map((comment) => {
                            const colorIndex = getColorIndex(comment.id);
                            const isEditing = editingCommentId === comment.id;
                            const isHovered = hoveredCommentId === comment.id;

                            return (
                                <div
                                    key={comment.id}
                                    onMouseEnter={() => setHoveredCommentId(comment.id)}
                                    onMouseLeave={() => setHoveredCommentId(null)}
                                    className={`group relative p-3 rounded-lg border-l-4 transition-all duration-200 ${
                                        isHovered ? 'shadow-md scale-[1.01]' : 'shadow-sm'
                                    }`}
                                    style={{
                                        borderLeftColor: commentBorderColors[colorIndex],
                                        backgroundColor: isHovered ? commentBgColors[colorIndex] : undefined,
                                    }}
                                >
                                    {/* Delete button */}
                                    <button
                                        onClick={() => onDeleteComment(comment.fieldId, comment.id)}
                                        className="absolute top-1.5 right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50 text-red-500 dark:text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-200 dark:hover:bg-red-800 transition-all"
                                        title="Delete comment"
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>

                                    {/* Field label */}
                                    <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1 pr-6">
                                        {comment.fieldLabel}
                                    </div>

                                    {/* Author and time */}
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-semibold shadow-sm">
                                            {comment.author.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                                {comment.author}
                                            </div>
                                            <div className="text-[10px] text-gray-500 dark:text-gray-400">
                                                {formatTimestamp(comment.timestamp)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Comment text or edit form */}
                                    {isEditing ? (
                                        <div className="flex gap-1">
                                            <textarea
                                                value={editingText}
                                                onChange={(e) => setEditingText(e.target.value)}
                                                className="flex-1 text-xs p-2 border rounded-md bg-white dark:bg-gray-600 border-gray-300 dark:border-gray-500 text-black dark:text-white focus:ring-2 focus:ring-blue-400 resize-none"
                                                rows={2}
                                                autoFocus
                                            />
                                            <div className="flex flex-col gap-1">
                                                <button
                                                    onClick={() => handleSaveEdit(comment)}
                                                    className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
                                                >
                                                    ✓
                                                </button>
                                                <button
                                                    onClick={handleCancelEdit}
                                                    className="px-2 py-1 text-xs bg-gray-400 text-white rounded hover:bg-gray-500"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                                            {comment.text}
                                        </p>
                                    )}

                                    {/* Actions */}
                                    {!isEditing && (
                                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                                            {currentUsername === comment.author && (
                                                <button
                                                    onClick={() => handleStartEdit(comment)}
                                                    className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                                                >
                                                    Edit
                                                </button>
                                            )}
                                            <button
                                                onClick={() => onResolveComment(comment.fieldId, comment.id)}
                                                className="ml-auto text-[10px] px-2 py-0.5 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded hover:bg-green-100 dark:hover:bg-green-900/50"
                                            >
                                                ✓ Resolve
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Resolved section */}
                        {resolvedComments.length > 0 && (
                            <>
                                <div className="text-xs text-gray-400 dark:text-gray-500 pt-2 border-t border-gray-200 dark:border-gray-700">
                                    Resolved ({resolvedComments.length})
                                </div>
                                {resolvedComments.map((comment) => {
                                    const colorIndex = getColorIndex(comment.id);
                                    return (
                                        <div
                                            key={comment.id}
                                            className="group relative p-3 rounded-lg border-l-4 opacity-50 shadow-sm"
                                            style={{ borderLeftColor: '#9CA3AF' }}
                                        >
                                            <button
                                                onClick={() => onDeleteComment(comment.fieldId, comment.id)}
                                                className="absolute top-1.5 right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-red-100 text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                                title="Delete"
                                            >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                            <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1 pr-6">
                                                {comment.fieldLabel}
                                            </div>
                                            <p className="text-xs text-gray-500 line-through">
                                                {comment.text}
                                            </p>
                                            <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                                                <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">
                                                    ✓ Resolved
                                                </span>
                                                <button
                                                    onClick={() => onResolveComment(comment.fieldId, comment.id)}
                                                    className="text-[10px] px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-100"
                                                >
                                                    ↻ Reopen
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PageCommentsPanel;
