import { useCallback, useMemo, useState } from 'react';
import type { TextComment, CommentReply } from '../types';
import type { FieldComment, CommentAnchor } from './CommentsRail';
import { CommentAnchorPosition } from './BulletPointEditor';

/* ============================================================
   useComments Hook

   Shared comment logic for DfrStandard and DfrSaskpower.

   CRITICAL: Author Preservation
   - getCurrentUsername() is ONLY called when creating NEW comments/replies
   - When loading projects, stored authors are NEVER overwritten
   - This ensures comment attribution persists across save/load cycles

   The hook manages:
   - Comment CRUD operations
   - Reply threading
   - Anchor position tracking
   - Converting field-level comments to FieldComment format
   ============================================================ */

// Get Windows username - ONLY use for NEW comments/replies
export const getCurrentUsername = (): string => {
    try {
        if (typeof window === 'undefined') return 'User';
        const electronAPI = (window as any).electronAPI;
        if (electronAPI?.getUserInfo) {
            const userInfo = electronAPI.getUserInfo();
            if (userInfo?.username) return userInfo.username;
        }
    } catch (error) {
        console.error('Error getting username:', error);
    }
    return 'User';
};

// Type for inline comments structure
type InlineCommentsMap = {
    [fieldId: string]: TextComment[] | undefined;
};

interface UseCommentsOptions<T> {
    data: T;
    setData: React.Dispatch<React.SetStateAction<T>>;
    inlineCommentsKey: keyof T;
    fieldLabels: Record<string, string>;
}

interface UseCommentsResult {
    // State
    commentsCollapsed: boolean;
    setCommentsCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
    commentAnchors: Map<string, CommentAnchor>;

    // Derived data
    allComments: FieldComment[];
    hasAnyInlineComments: boolean;

    // Handlers
    handleAnchorPositionsChange: (fieldId: string, anchors: CommentAnchorPosition[]) => void;
    handleDeleteComment: (fieldId: string, commentId: string) => void;
    handleResolveComment: (fieldId: string, commentId: string) => void;
    handleUpdateComment: (fieldId: string, commentId: string, newText: string) => void;
    handleAddReply: (fieldId: string, commentId: string, replyText: string) => void;
    handleDeleteReply: (fieldId: string, commentId: string, replyId: string) => void;
    handleInlineCommentsChange: (field: string, comments: TextComment[]) => void;
}

export function useComments<T extends Record<string, any>>({
    data,
    setData,
    inlineCommentsKey,
    fieldLabels,
}: UseCommentsOptions<T>): UseCommentsResult {
    const [commentsCollapsed, setCommentsCollapsed] = useState(false);
    const [commentAnchors, setCommentAnchors] = useState<Map<string, CommentAnchor>>(new Map());

    // Get inline comments from data
    const inlineComments = (data[inlineCommentsKey] || {}) as InlineCommentsMap;

    // Handler to collect anchor positions from BulletPointEditor instances
    const handleAnchorPositionsChange = useCallback((fieldId: string, anchors: CommentAnchorPosition[]) => {
        setCommentAnchors(prev => {
            const newMap = new Map(prev);
            // Remove old anchors for this field
            for (const key of newMap.keys()) {
                if (key.startsWith(`${fieldId}:`)) {
                    newMap.delete(key);
                }
            }
            // Add new anchors
            anchors.forEach(anchor => {
                const key = `${anchor.fieldId}:${anchor.commentId}`;
                newMap.set(key, {
                    fieldId: anchor.fieldId,
                    commentId: anchor.commentId,
                    top: anchor.top,
                    left: anchor.left,
                    height: anchor.height,
                });
            });
            return newMap;
        });
    }, []);

    // Collect all comments from all fields into a single array
    const allComments: FieldComment[] = useMemo(() => {
        const comments: FieldComment[] = [];
        const fields = Object.keys(fieldLabels);

        fields.forEach(field => {
            const fieldComments = inlineComments[field];
            if (fieldComments && Array.isArray(fieldComments) && fieldComments.length > 0) {
                fieldComments.forEach(comment => {
                    // Skip null/undefined comments or those missing required fields
                    if (!comment || !comment.id || typeof comment.start !== 'number' || typeof comment.end !== 'number') {
                        return;
                    }
                    comments.push({
                        ...comment,
                        fieldId: field,
                        fieldLabel: fieldLabels[field] || field,
                    });
                });
            }
        });
        return comments;
    }, [inlineComments, fieldLabels]);

    const hasAnyInlineComments = allComments.length > 0;

    // Delete a comment
    const handleDeleteComment = useCallback((fieldId: string, commentId: string) => {
        const fieldComments = inlineComments[fieldId];
        if (fieldComments) {
            const updatedComments = fieldComments.filter(c => c.id !== commentId);
            setData(prev => ({
                ...prev,
                [inlineCommentsKey]: {
                    ...(prev[inlineCommentsKey] as InlineCommentsMap),
                    [fieldId]: updatedComments,
                },
            }));
        }
    }, [inlineComments, setData, inlineCommentsKey]);

    // Toggle resolved state
    const handleResolveComment = useCallback((fieldId: string, commentId: string) => {
        const fieldComments = inlineComments[fieldId];
        if (fieldComments) {
            const updatedComments = fieldComments.map(c =>
                c.id === commentId ? { ...c, resolved: !c.resolved } : c
            );
            setData(prev => ({
                ...prev,
                [inlineCommentsKey]: {
                    ...(prev[inlineCommentsKey] as InlineCommentsMap),
                    [fieldId]: updatedComments,
                },
            }));
        }
    }, [inlineComments, setData, inlineCommentsKey]);

    // Update comment text (does NOT change author - author is preserved)
    const handleUpdateComment = useCallback((fieldId: string, commentId: string, newText: string) => {
        const fieldComments = inlineComments[fieldId];
        if (fieldComments) {
            const updatedComments = fieldComments.map(c =>
                c.id === commentId ? { ...c, text: newText } : c
            );
            setData(prev => ({
                ...prev,
                [inlineCommentsKey]: {
                    ...(prev[inlineCommentsKey] as InlineCommentsMap),
                    [fieldId]: updatedComments,
                },
            }));
        }
    }, [inlineComments, setData, inlineCommentsKey]);

    // Add a reply - uses getCurrentUsername() for the NEW reply author
    const handleAddReply = useCallback((fieldId: string, commentId: string, replyText: string) => {
        const fieldComments = inlineComments[fieldId];
        if (fieldComments) {
            const updatedComments = fieldComments.map(c => {
                if (c.id === commentId) {
                    const newReply: CommentReply = {
                        id: `reply_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
                        text: replyText,
                        // ONLY place where getCurrentUsername() is called for replies
                        author: getCurrentUsername(),
                        timestamp: new Date(),
                    };
                    return {
                        ...c,
                        replies: [...(c.replies || []), newReply],
                    };
                }
                return c;
            });
            setData(prev => ({
                ...prev,
                [inlineCommentsKey]: {
                    ...(prev[inlineCommentsKey] as InlineCommentsMap),
                    [fieldId]: updatedComments,
                },
            }));
        }
    }, [inlineComments, setData, inlineCommentsKey]);

    // Delete a reply
    const handleDeleteReply = useCallback((fieldId: string, commentId: string, replyId: string) => {
        const fieldComments = inlineComments[fieldId];
        if (fieldComments) {
            const updatedComments = fieldComments.map(c => {
                if (c.id === commentId && c.replies) {
                    return {
                        ...c,
                        replies: c.replies.filter(r => r.id !== replyId),
                    };
                }
                return c;
            });
            setData(prev => ({
                ...prev,
                [inlineCommentsKey]: {
                    ...(prev[inlineCommentsKey] as InlineCommentsMap),
                    [fieldId]: updatedComments,
                },
            }));
        }
    }, [inlineComments, setData, inlineCommentsKey]);

    // Handler for BulletPointEditor to update comments for a specific field
    const handleInlineCommentsChange = useCallback((field: string, comments: TextComment[]) => {
        setData(prev => ({
            ...prev,
            [inlineCommentsKey]: {
                ...(prev[inlineCommentsKey] as InlineCommentsMap),
                [field]: comments,
            },
        }));
    }, [setData, inlineCommentsKey]);

    return {
        commentsCollapsed,
        setCommentsCollapsed,
        commentAnchors,
        allComments,
        hasAnyInlineComments,
        handleAnchorPositionsChange,
        handleDeleteComment,
        handleResolveComment,
        handleUpdateComment,
        handleAddReply,
        handleDeleteReply,
        handleInlineCommentsChange,
    };
}

export default useComments;
