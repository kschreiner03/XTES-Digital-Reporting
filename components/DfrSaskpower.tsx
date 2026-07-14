import React, { useState, ReactElement, useEffect, useRef, useCallback, useMemo } from 'react';
import type { DfrSaskpowerData, ChecklistOption, PhotoData, LocationActivity, ActivityBlock, TextHighlight, TextComment } from '../types';
import { DownloadIcon, SaveIcon, FolderOpenIcon, ArrowLeftIcon, PlusIcon, TrashIcon, CloseIcon, FolderArrowDownIcon, ChatBubbleLeftIcon, ZoomInIcon, ZoomOutIcon, ChevronDownIcon } from './icons';
import PdfPreviewModal from './PdfPreviewModal';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { AppType } from '../App';
import PhotoEntry from './PhotoEntry';
import { storeImage, retrieveImage, deleteImage, revokeImageUrl, storeProject, deleteProject, deleteThumbnail, storeThumbnail, retrieveProject } from './db';
import { generateProjectThumbnail } from './thumbnailUtils';
import { safeSet } from './safeStorage';
import { SpecialCharacterPalette } from './SpecialCharacterPalette';
import BulletPointEditor from './BulletPointEditor';
import ImageModal from './ImageModal';
import ActionStatusModal from './ActionStatusModal';
import CommentsRail, { FieldComment, CommentAnchor } from './CommentsRail';
import { CommentAnchorPosition } from './BulletPointEditor';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import SafeImage, { getAssetUrl } from './SafeImage';
import { toast } from './Toast';
import { perfMark, perfMeasure } from './perf';

// --- Recent Projects Utility ---
const RECENT_PROJECTS_KEY = 'xtec_recent_projects';

interface RecentProjectMetadata {
    type: AppType;
    name: string;
    projectNumber: string;
    timestamp: number;
    proponent?: string;
    date?: string;
}

// --------------------
// Recent Projects List
// --------------------

const getRecentProjects = (): RecentProjectMetadata[] => {
    try {
        const projects = localStorage.getItem(RECENT_PROJECTS_KEY);
        return projects ? JSON.parse(projects) : [];
    } catch (e) {
        console.error('Failed to parse recent projects from localStorage', e);
        return [];
    }
};

// --------------------
// Add / Update Recent Project
// --------------------

const addRecentProject = async (
    projectData: any,
    projectInfo: { type: AppType; name: string; projectNumber: string; proponent?: string; date?: string },
    existingTimestamp?: number
): Promise<number | null> => {
    const timestamp = existingTimestamp ?? Date.now();

    try {
        await storeProject(timestamp, projectData);
    } catch (e) {
        console.error('Failed to save project to IndexedDB:', e);
        return null;
    }

    try {
        const firstPhoto = projectData.photosData?.find(
            (p: any) => p.imageUrl && !p.isMap
        );
        const thumbnail = await generateProjectThumbnail({
            type: projectInfo.type,
            projectName: projectInfo.name,
            firstPhotoUrl: firstPhoto?.imageUrl || null,
        });
        await storeThumbnail(timestamp, thumbnail);
    } catch (e) {
        console.warn('Failed to generate/store thumbnail:', e);
    }

    const recentProjects = getRecentProjects();

    const filteredProjects = existingTimestamp
        ? recentProjects.filter(p => p.timestamp !== existingTimestamp)
        : (() => {
            const identifier = `${projectInfo.type}-${projectInfo.name}-${projectInfo.projectNumber}`;
            const old = recentProjects.find(p => `${p.type}-${p.name}-${p.projectNumber}` === identifier);
            if (old) {
                deleteProject(old.timestamp).catch(() => {});
                deleteThumbnail(old.timestamp).catch(() => {});
            }
            return recentProjects.filter(p => `${p.type}-${p.name}-${p.projectNumber}` !== identifier);
        })();

    let updatedProjects = [{ ...projectInfo, timestamp }, ...filteredProjects];

    const MAX_RECENT_PROJECTS_IN_LIST = 20;
    if (updatedProjects.length > MAX_RECENT_PROJECTS_IN_LIST) {
        const toDelete = updatedProjects.splice(MAX_RECENT_PROJECTS_IN_LIST);
        for (const proj of toDelete) {
            deleteProject(proj.timestamp).catch(() => {});
            deleteThumbnail(proj.timestamp).catch(() => {});
        }
    }

    safeSet(RECENT_PROJECTS_KEY, JSON.stringify(updatedProjects));
    return timestamp;
};

// --------------------
// Date Formatter (unchanged)
// --------------------

const formatDateForRecentProject = (dateString: string): string => {
    if (!dateString) return '';
    try {
        const tempDate = new Date(dateString);
        if (isNaN(tempDate.getTime())) return dateString;

        const year = tempDate.getFullYear();
        const month = tempDate.getMonth();
        const day = tempDate.getDate();

        const utcDate = new Date(Date.UTC(year, month, day));

        const formattedYear = utcDate.getUTCFullYear();
        const formattedMonth = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
        const formattedDay = String(utcDate.getUTCDate()).padStart(2, '0');

        return `${formattedYear}/${formattedMonth}/${formattedDay}`;
    } catch {
        return dateString;
    }
};
// --- End Utility ---

// --- Helper Functions ---
const getImageDimensions = (url: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = (err) => reject(err);
        img.src = url;
    });
};

const autoCropImage = (imageUrl: string): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onerror = () => resolve(imageUrl);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(imageUrl);
                return;
            }
            const canvasWidth = 1024;
            const canvasHeight = 768;
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            const targetAspectRatio = canvasWidth / canvasHeight;
            const originalAspectRatio = img.width / img.height;
            let drawWidth, drawHeight, drawX, drawY;
            if (originalAspectRatio > targetAspectRatio) {
                drawWidth = canvas.width;
                drawHeight = drawWidth / originalAspectRatio;
                drawX = 0;
                drawY = (canvas.height - drawHeight) / 2;
            } else {
                drawHeight = canvas.height;
                drawWidth = drawHeight * originalAspectRatio;
                drawY = 0;
                drawX = (canvas.width - drawWidth) / 2;
            }
            ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.src = imageUrl;
    });
};

const formatDateForFilename = (dateString: string): string => {
    if (!dateString) return 'NoDate';
    try {
        const tempDate = new Date(dateString);
        if (isNaN(tempDate.getTime())) {
            return dateString.replace(/[^a-z0-9]/gi, '');
        }
        const year = tempDate.getFullYear();
        const month = tempDate.getMonth();
        const day = tempDate.getDate();
        const utcDate = new Date(Date.UTC(year, month, day));
        const formattedMonth = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
        const formattedDay = String(utcDate.getUTCDate()).padStart(2, '0');
        const formattedYear = utcDate.getUTCFullYear();
        return `${formattedMonth}-${formattedDay}-${formattedYear}`;
    } catch (e) {
        return dateString.replace(/[^a-z0-9]/gi, '');
    }
};
// --- End Helper Functions ---


// --- UI Components ---
const Section: React.FC<{ title: string; children: React.ReactNode; }> = ({ title, children }) => (
    <div className="xtec-report-card p-6 transition-colors duration-200" style={{ overflow: 'visible' }}>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#007D8C] border-b border-gray-100 dark:border-white/5 pb-3 mb-4">{title}</p>
        <div className="space-y-4" style={{ overflow: 'visible' }}>{children}</div>
    </div>
);

const EditableField: React.FC<{ label: string; value: string; onChange: (value: string) => void; type?: string; isTextArea?: boolean; rows?: number; placeholder?: string; isInvalid?: boolean; }> = ({ label, value, onChange, type = 'text', isTextArea = false, rows = 1, placeholder = '', isInvalid = false }) => {
    const commonClasses = `block w-full p-2 border rounded-lg focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition bg-gray-50 dark:bg-white/5 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 ${isInvalid ? 'border-red-500' : 'border-gray-200 dark:border-white/10'}`;
    const elementRef = React.useRef<HTMLInputElement & HTMLTextAreaElement>(null);

    return (
        <div>
            {label && <label className="block text-sm font-medium text-gray-700 dark:text-gray-400 mb-1">{label}</label>}
            {isTextArea ? (
                <textarea
                    ref={elementRef}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    rows={rows}
                    className={commonClasses}
                    placeholder={placeholder}
                    spellCheck={true}
                />
            ) : (
                <input
                    type={type}
                    ref={elementRef}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className={commonClasses}
                    placeholder={placeholder}
                    spellCheck={true}
                />
            )}
        </div>
    );
};

const ChecklistRow: React.FC<{ label: string; value: ChecklistOption; onChange: (value: ChecklistOption) => void; isInvalid?: boolean; }> = ({ label, value, onChange, isInvalid = false }) => (
    <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between py-2 border-b last:border-b-0 ${isInvalid ? 'border-red-500 bg-red-50 dark:bg-red-900/20 px-2 rounded-lg' : 'border-gray-100 dark:border-white/5'}`}>
        <span className={`text-sm font-medium mb-2 sm:mb-0 ${isInvalid ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-200'}`}>{label}</span>
        <div className="flex items-center space-x-4">
            {(['Yes', 'No', 'NA'] as ChecklistOption[]).map(option => (
                <label key={option} className="flex items-center space-x-1.5 cursor-pointer text-sm text-gray-600 dark:text-gray-400">
                    <input
                        type="radio"
                        name={label}
                        value={option}
                        checked={value === option}
                        onChange={() => onChange(option)}
                        className="h-4 w-4 accent-[#007D8C] focus:ring-[#007D8C]/40"
                    />
                    <span>{option}</span>
                </label>
            ))}
        </div>
    </div>
);

const saskPowerPlaceholders = {
    generalActivity: `08:30 - Leave Estevan to project area.
10:00 - Arrive near structure 285 on B1K. Complete X-Terra hazard assessment. Contact Davey crew and assess access options to get to structure 285.
10:30 - Meet Davey crew and review permits and hazard assessments for Davey and X-Terra. Permit outlines 30m wetland buffer for all herbicide activities (including basal bark).
10:45 - Finish spraying structure #285. Travel to structure #19.
12:30 - Arrive at Structure #19 is located in same quarter section as EM sites 17-18, but structure #19 itself is not in an AHPP area and does not require an EM (confirmed this in person). Crew completed structure #19. Travel to structures 10 and 9.
1:30 - Arrive at structures 10 and 9. Both are EM structures - crews completed herbicide application.
2:00 - Finish structures 10 and 9. All EM sites completed on B1K. Head back to Estevan.
2:30 - Arrive in Estevan. Complete DFR.`,
    equipmentOnsite: `- None`,
    weatherAndGroundConditions: `- Overcast conditions
- Wind 10–20 km/hr
- Temperatures 16–23°C
- Dry and stable ground conditions`,
    environmentalProtection: `- All applicable permit conditions were followed
- Crews remained within approved project boundaries
- Wetland buffers were identified and respected
- No environmental incidents observed`,
    wildlifeObservations: `- Red-Tailed Hawk
- Killdeer
- Western Meadowlark`,
    futureMonitoring: `- Monitoring will continue the following day
- Ongoing observation of vegetation management activities`
};

// --- Main Component ---
interface DfrSaskpowerProps {
    onBack: () => void;
    onBackDirect?: () => void;
    initialData?: any;
}

const DfrSaskpower = ({ onBack, onBackDirect, initialData }: DfrSaskpowerProps): ReactElement => {
    const [data, setData] = useState<DfrSaskpowerData>({
        proponent: 'SaskPower',
        date: '',
        location: '',
        projectName: '',
        vendorAndForeman: '',
        projectNumber: '',
        environmentalMonitor: '',
        envFileNumber: '',
        generalActivity: '',
        locationActivities: [],
        totalHoursWorked: '',
        completedTailgate: '',
        reviewedTailgate: '',
        reviewedPermits: '',
        equipmentOnsite: '',
        weatherAndGroundConditions: '',
        environmentalProtection: '',
        wildlifeObservations: '',
        futureMonitoring: '',
        comments: {},
    });
    const [photosData, setPhotosData] = useState<PhotoData[]>([]);
    const [errors, setErrors] = useState(new Set<string>());
    const [showValidationErrorModal, setShowValidationErrorModal] = useState(false);
    const [showUnsupportedFileModal, setShowUnsupportedFileModal] = useState<boolean>(false);
    const [showNoInternetModal, setShowNoInternetModal] = useState(false);
    const [showMigrationNotice, setShowMigrationNotice] = useState(false);
    const [enlargedImageUrl, setEnlargedImageUrl] = useState<string | null>(null);
    const [pdfPreview, setPdfPreview] = useState<{ blob: Blob; filename: string } | null>(null);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [openComments, setOpenComments] = useState<Set<string>>(new Set());
    const [zoomLevel, setZoomLevel] = useState(100);
    const [isDirty, setIsDirty] = useState(false);
    const [showUnsavedModal, setShowUnsavedModal] = useState(false);
    const [showFirstSaveModal, setShowFirstSaveModal] = useState(false);
    const [firstSaveHeader, setFirstSaveHeader] = useState({ proponent: '', projectName: '', location: '', date: '', projectNumber: '' });
    const AUTOSAVE_INTERVAL_KEY = 'xtec_autosave_interval';
    const [autosaveEnabled, setAutosaveEnabled] = useState(initialData?.timestamp != null);
    const [autosaveIntervalMs, setAutosaveIntervalMs] = useState(() => parseInt(localStorage.getItem(AUTOSAVE_INTERVAL_KEY) || '30') * 1000);
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const moreMenuRef = useRef<HTMLDivElement>(null);
    const quickSaveRef = useRef<() => Promise<void>>();
    const saveProjectRef = useRef<() => Promise<void>>();
    const savePdfRef = useRef<() => void>();
    const savedFilePathRef = useRef<string | null>((() => {
        const direct = (initialData as any)?.filePath ?? null;
        if (direct) return direct;
        const ts = initialData?.timestamp;
        if (!ts) return null;
        try { const m = JSON.parse(localStorage.getItem('xtec_file_paths') ?? '{}'); return m[String(ts)] ?? null; } catch { return null; }
    })());
    const photosDataRef = useRef(photosData);
    photosDataRef.current = photosData;
    // fileSynced: true=in sync with file, false=pending sync, null=no file linked
    const [fileSynced, setFileSynced] = useState<boolean | null>(savedFilePathRef.current ? true : null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
    const [justSaved, setJustSaved] = useState(false);
    const justSavedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const projectTimestampRef = useRef<number | null>(initialData?.timestamp ?? null);
    const isSavingRef = useRef(false);
    const isDirtyRef = useRef(isDirty);
    isDirtyRef.current = isDirty;
    const autosaveEnabledRef = useRef(autosaveEnabled);
    autosaveEnabledRef.current = autosaveEnabled;
    const fileInputRef = useRef<HTMLInputElement>(null);
    const batchInputRef = useRef<HTMLInputElement>(null);
    const isDownloadingRef = useRef(false);
    const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
    const [isDroppingFiles, setIsDroppingFiles] = useState(false);

    const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 10, 150));
    const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 10, 70));
    const handleZoomReset = () => setZoomLevel(100);

    // Comments panel state
    const [commentsCollapsed, setCommentsCollapsed] = useState(false);
    const [commentAnchors, setCommentAnchors] = useState<Map<string, CommentAnchor>>(new Map());
    const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);

    // Handler to collect anchor positions from BulletPointEditor instances
    const handleAnchorPositionsChange = useCallback((fieldId: string, anchors: CommentAnchorPosition[]) => {
        setCommentAnchors(prev => {
            // Build the updated map
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
            // Bail out (return same reference) if nothing changed — prevents re-render loop
            if (newMap.size === prev.size) {
                let changed = false;
                for (const [k, v] of newMap) {
                    const p = prev.get(k);
                    if (!p || p.top !== v.top || p.left !== v.left || p.height !== v.height) {
                        changed = true;
                        break;
                    }
                }
                if (!changed) return prev;
            }
            return newMap;
        });
    }, []);

    // Field labels for comments panel
    const fieldLabels: Record<string, string> = useMemo(() => {
        const labels: Record<string, string> = {
            generalActivity: 'General Activity',
            equipmentOnsite: 'Equipment Onsite',
            weatherAndGroundConditions: 'Weather & Ground',
            environmentalProtection: 'Environmental Protection',
            wildlifeObservations: 'Wildlife Observations',
            futureMonitoring: 'Future Monitoring',
        };
        photosData.forEach(p => {
            labels[`photo-${p.id}-description`] = `Photo ${p.photoNumber}`;
        });
        return labels;
    }, [photosData]);

    // Collect all comments from all fields into a single array
    const allComments: FieldComment[] = React.useMemo(() => {
        const comments: FieldComment[] = [];
        // Body fields
        if (data.inlineComments) {
            const fields = ['generalActivity', 'equipmentOnsite', 'weatherAndGroundConditions', 'environmentalProtection', 'wildlifeObservations', 'futureMonitoring'] as const;
            fields.forEach(field => {
                const fieldComments = data.inlineComments?.[field];
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
        }
        // Photo description fields
        photosData.forEach(photo => {
            if (photo.inlineComments && Array.isArray(photo.inlineComments) && photo.inlineComments.length > 0) {
                const fid = `photo-${photo.id}-description`;
                photo.inlineComments.forEach(comment => {
                    if (!comment || !comment.id || typeof comment.start !== 'number' || typeof comment.end !== 'number') return;
                    comments.push({ ...comment, fieldId: fid, fieldLabel: fieldLabels[fid] || `Photo ${photo.photoNumber}` });
                });
            }
        });
        return comments;
    }, [data.inlineComments, photosData, fieldLabels]);

    const hasAnyInlineComments = allComments.length > 0;

    // Helper: check if a fieldId belongs to a photo description
    const getPhotoIdFromFieldId = (fieldId: string): number | null => {
        const match = fieldId.match(/^photo-(\d+)-description$/);
        return match ? parseInt(match[1], 10) : null;
    };

    // Helper: get comments array for a fieldId (body field or photo)
    const getFieldComments = (fieldId: string): TextComment[] | undefined => {
        const photoId = getPhotoIdFromFieldId(fieldId);
        if (photoId !== null) {
            const photo = photosData.find(p => p.id === photoId);
            return photo?.inlineComments;
        }
        return (data.inlineComments as any)?.[fieldId];
    };

    // Helper: update comments for a fieldId (body field or photo)
    const setFieldComments = (fieldId: string, updater: (comments: TextComment[]) => TextComment[]) => {
        const photoId = getPhotoIdFromFieldId(fieldId);
        if (photoId !== null) {
            setPhotosData(prev => prev.map(p =>
                p.id === photoId ? { ...p, inlineComments: updater(p.inlineComments || []) } : p
            ));
        } else {
            setData(prev => ({
                ...prev,
                inlineComments: {
                    ...prev.inlineComments,
                    [fieldId]: updater((prev.inlineComments as any)?.[fieldId] || []),
                },
            }));
        }
        setIsDirty(true); if (savedFilePathRef.current) setFileSynced(false);
    };

    // Comment action handlers for CommentsRail
    const handleDeleteComment = (fieldId: string, commentId: string) => {
        if (getFieldComments(fieldId)) {
            setFieldComments(fieldId, comments => comments.filter(c => c.id !== commentId));
        }
    };

    const handleResolveComment = (fieldId: string, commentId: string) => {
        if (getFieldComments(fieldId)) {
            setFieldComments(fieldId, comments =>
                comments.map(c => c.id === commentId ? { ...c, resolved: !c.resolved } : c)
            );
        }
    };

    const handleUpdateComment = (fieldId: string, commentId: string, newText: string) => {
        if (getFieldComments(fieldId)) {
            setFieldComments(fieldId, comments =>
                comments.map(c => c.id === commentId ? { ...c, text: newText } : c)
            );
        }
    };

    // Reply handlers for CommentsRail
    const handleAddReply = (fieldId: string, commentId: string, replyText: string) => {
        if (getFieldComments(fieldId)) {
            setFieldComments(fieldId, comments =>
                comments.map(c => {
                    if (c.id === commentId) {
                        const newReply = {
                            id: `reply_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
                            text: replyText,
                            author: (window as any).electronAPI?.getUserInfo?.()?.username || 'User',
                            timestamp: new Date(),
                        };
                        return { ...c, replies: [...(c.replies || []), newReply] };
                    }
                    return c;
                })
            );
        }
    };

    const handleDeleteReply = (fieldId: string, commentId: string, replyId: string) => {
        if (getFieldComments(fieldId)) {
            setFieldComments(fieldId, comments =>
                comments.map((c: TextComment) => {
                    if (c.id === commentId && c.replies) {
                        return { ...c, replies: c.replies.filter(r => r.id !== replyId) };
                    }
                    return c;
                })
            );
        }
    };

    // Focus handler - scrolls to comment in text and triggers glow
    const handleFocusComment = (fieldId: string, commentId: string) => {
        // Find the element with the comment underline
        const element = document.querySelector(`[data-comment-id="${commentId}"]`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    const processLoadedData = async (projectData: any) => {
        const { photosData: loadedPhotos, ...saskpowerData } = projectData;
        
        let migrationOccurred = false;
        let finalData = { ...data, ...saskpowerData };

        const activitiesToMerge = new Set<string>();
        if (finalData.generalActivity) activitiesToMerge.add(finalData.generalActivity);
        if ((finalData as any).projectActivities) {
            activitiesToMerge.add((finalData as any).projectActivities);
            migrationOccurred = true;
        }

        const allLocationActivities: LocationActivity[] = [];
        if (finalData.locationActivities?.length) allLocationActivities.push(...finalData.locationActivities);
        if ((finalData as any).locationActivities_old?.length) {
            allLocationActivities.push(...(finalData as any).locationActivities_old);
            migrationOccurred = true;
        }
        if ((finalData as any).activityBlocks?.length) {
            for (const block of (finalData as any).activityBlocks) {
                if (block.type === 'general' && block.activities) {
                    activitiesToMerge.add(block.activities);
                } else if (block.type === 'location') {
                    allLocationActivities.push({id: block.id, location: block.location || '', activities: block.activities});
                }
            }
            migrationOccurred = true;
        }
        
        if (allLocationActivities.length > 0) {
            const locationTexts = allLocationActivities.map(
                (loc) => `--- Location: ${loc.location || 'Unspecified'} ---\n${loc.activities}`
            );
            locationTexts.forEach(text => activitiesToMerge.add(text));
            if(finalData.locationActivities?.length > 0) migrationOccurred = true;
        }

        finalData.generalActivity = Array.from(activitiesToMerge).join('\n\n');
        finalData.locationActivities = [];

        delete (finalData as any).activityBlocks;
        delete (finalData as any).projectActivities;
        delete (finalData as any).locationActivities_old;

        setData(finalData);
        
        if (migrationOccurred) {
            setShowMigrationNotice(true);
        }

        if (loadedPhotos && Array.isArray(loadedPhotos)) {
             const hydratedPhotos = await Promise.all(
                loadedPhotos.map(async (photo: PhotoData) => {
                    if (photo.imageId && !photo.imageUrl) {
                        const imageUrl = await retrieveImage(photo.imageId);
                        return { ...photo, imageUrl: imageUrl || null };
                    }
                    return photo;
                })
            );
            setPhotosData(hydratedPhotos.filter(p => p.imageUrl || p.imageId));
        } else {
            setPhotosData([]);
        }

        return finalData;
    };

    const parseAndLoadProject = async (fileContent: string) => {
        try {
            const projectData = JSON.parse(fileContent);
            const finalData = await processLoadedData(projectData);

            const formattedDate = formatDateForRecentProject(finalData.date);
            const dateSuffix = formattedDate ? ` - ${formattedDate}` : '';
            const projectName = `${finalData.projectName || 'Untitled SaskPower DFR'}${dateSuffix}`;

            const stateForRecent = await prepareStateForRecentProjectStorage(finalData);
            await addRecentProject(stateForRecent, { type: 'dfrSaskpower', name: projectName, projectNumber: finalData.projectNumber, proponent: finalData.proponent, date: finalData.date });
        } catch (err) {
            alert('Error parsing project file. Ensure it is a valid project file.');
            console.error(err);
        }
    }

    useEffect(() => {
        const loadInitialData = async () => {
            if (initialData) {
                await processLoadedData(initialData);
            } else {
                // Load defaults for new projects
                try {
                    const settings = JSON.parse(localStorage.getItem('xtec_general_settings') || '{}');
                    if (settings.defaultMonitor) {
                         setData(prev => ({ ...prev, environmentalMonitor: settings.defaultMonitor }));
                    }
                } catch (e) {
                    console.error("Failed to load settings", e);
                }
            }
        };
        loadInitialData();
    }, [initialData]);

    // Track whether the unsaved modal was triggered by window close vs Home button
    const pendingCloseRef = useRef(false);

    // Warn before closing browser window (non-Electron fallback)
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isDirty]);

    // Intercept Electron window close (X button)
    useEffect(() => {
        // @ts-ignore
        const api = window.electronAPI;
        if (api?.onCloseAttempted) {
            api.removeCloseAttemptedListener?.();
            api.onCloseAttempted(() => {
                if (isDirty) {
                    pendingCloseRef.current = true;
                    setShowUnsavedModal(true);
                } else {
                    api.confirmClose();
                }
            });
        }
        return () => {
            // @ts-ignore
            window.electronAPI?.removeCloseAttemptedListener?.();
        };
    }, [isDirty]);

    // Persist initial file path to localStorage on mount so future sessions can find it
    useEffect(() => {
        const p = savedFilePathRef.current;
        const ts = projectTimestampRef.current ?? initialData?.timestamp;
        if (p && ts) { try { const m=JSON.parse(localStorage.getItem('xtec_file_paths')?? '{}'); if(!m[String(ts)]){m[String(ts)]=p;localStorage.setItem('xtec_file_paths',JSON.stringify(m));} } catch {} }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!(initialData as any)?.newDay) return;
        const todayStr = new Date().toLocaleDateString('en-CA', { year:'numeric', month:'long', day:'numeric' });
        setData(d => ({ ...d, date: todayStr }));
        savedFilePathRef.current = null;
        projectTimestampRef.current = null;
        setFileSynced(null);
        setAutosaveEnabled(false);
        setIsDirty(true);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleBack = () => {
        if (isDirty) {
            pendingCloseRef.current = false;
            setShowUnsavedModal(true);
        } else {
            onBack();
        }
    };

    const handleChange = (field: keyof Omit<DfrSaskpowerData, 'comments' | 'highlights'>, value: string | ChecklistOption | TextHighlight[]) => {
        setData(prev => ({ ...prev, [field]: value }));
        setIsDirty(true); if (savedFilePathRef.current) setFileSynced(false);
    };

    const handleHighlightsChange = (field: keyof Omit<DfrSaskpowerData, 'comments'>, highlights: TextHighlight[]) => {
        setData(prev => ({
            ...prev,
            highlights: {
                ...prev.highlights,
                [field]: highlights
            }
        }));
        setIsDirty(true); if (savedFilePathRef.current) setFileSynced(false);
    };

    const handleInlineCommentsChange = (field: keyof Omit<DfrSaskpowerData, 'comments'>, comments: TextComment[]) => {
        setData(prev => ({
            ...prev,
            inlineComments: {
                ...prev.inlineComments,
                [field]: comments
            }
        }));
        setIsDirty(true); if (savedFilePathRef.current) setFileSynced(false);
    };
    const toggleComment = (field: string) => {
        setOpenComments(prev => {
            const newSet = new Set(prev);
            if (newSet.has(field)) {
                newSet.delete(field);
            } else {
                newSet.add(field);
            }
            return newSet;
        });
    };

    const handleCommentChange = (field: string, value: string) => {
        setData(prev => ({
            ...prev,
            comments: {
                ...prev.comments,
                [field]: value
            }
        }));
        setIsDirty(true); if (savedFilePathRef.current) setFileSynced(false);
    };

    // --- Photo Handlers ---
    const handlePhotoDataChange = useCallback((id: number, field: keyof Omit<PhotoData, 'id' | 'imageUrl' | 'imageId'>, value: string) => {
        setPhotosData(prev => prev.map(photo => photo.id === id ? { ...photo, [field]: value } : photo));
        setIsDirty(true); if (savedFilePathRef.current) setFileSynced(false);
    }, []);

    const handlePhotoCommentsChange = useCallback((photoId: number, comments: TextComment[]) => {
        setPhotosData(prev => prev.map(p => p.id === photoId ? { ...p, inlineComments: comments } : p));
        setIsDirty(true); if (savedFilePathRef.current) setFileSynced(false);
    }, []);

    const handlePhotoHighlightsChange = useCallback((photoId: number, highlights: TextHighlight[]) => {
        setPhotosData(prev => prev.map(p => p.id === photoId ? { ...p, highlights } : p));
        setIsDirty(true); if (savedFilePathRef.current) setFileSynced(false);
    }, []);

    const handlePhotoAnchorPositionsChange = useCallback((id: number, anchors: CommentAnchorPosition[]) => {
        handleAnchorPositionsChange(`photo-${id}-description`, anchors);
    }, [handleAnchorPositionsChange]);

    const handleImageChange = useCallback((id: number, file: File) => {
        const allowedTypes = ['image/jpeg', 'image/png'];
        if (!allowedTypes.includes(file.type)) {
            setShowUnsupportedFileModal(true);
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
             const dataUrl = e.target?.result as string;
             autoCropImage(dataUrl).then(croppedImageUrl => {
                setPhotosData(prev => prev.map(photo => photo.id === id ? { ...photo, imageUrl: croppedImageUrl } : photo));
                setIsDirty(true); if (savedFilePathRef.current) setFileSynced(false);
             });
        };
        reader.readAsDataURL(file);
    }, []);

    const renumberPhotos = (photos: PhotoData[]) => {
        let photoCounter = 0;
        let mapCounter = 0;
        return photos.map((photo) => {
            if (photo.isMap) {
                 mapCounter++;
                 return { ...photo, photoNumber: `Map ${mapCounter}` };
            } else {
                photoCounter++;
                return { ...photo, photoNumber: String(photoCounter) };
            }
        });
    };

    const handleBatchImport = async (files: FileList | File[]) => {
        const fileArray = Array.from(files);
        const valid = fileArray.filter(f =>
            f.type === 'image/jpeg' || f.type === 'image/png' ||
            f.name.toLowerCase().endsWith('.jpg') || f.name.toLowerCase().endsWith('.jpeg') || f.name.toLowerCase().endsWith('.png')
        );
        const skipped = fileArray.length - valid.length;
        if (valid.length === 0) { setShowUnsupportedFileModal(true); return; }
        const nextId = photosData.length > 0 ? Math.max(...photosData.map(p => p.id)) + 1 : 1;
        const placeholders: PhotoData[] = valid.map((_, i) => ({
            id: nextId + i,
            photoNumber: '',
            date: data.date || '',
            location: '',
            description: '',
            imageUrl: null,
            direction: '',
        }));
        setPhotosData(prev => renumberPhotos([...prev, ...placeholders]));
        setBatchProgress({ current: 0, total: valid.length });
        for (let i = 0; i < valid.length; i++) {
            const targetId = nextId + i;
            await new Promise<void>(resolve => {
                const reader = new FileReader();
                reader.onload = async e => {
                    const dataUrl = e.target?.result as string;
                    const cropped = await autoCropImage(dataUrl).catch(() => dataUrl);
                    setPhotosData(prev => prev.map(p => p.id === targetId ? { ...p, imageUrl: cropped } : p));
                    setBatchProgress({ current: i + 1, total: valid.length });
                    resolve();
                };
                reader.onerror = () => {
                    setPhotosData(prev => prev.filter(p => p.id !== targetId));
                    setBatchProgress({ current: i + 1, total: valid.length });
                    resolve();
                };
                reader.readAsDataURL(valid[i]);
            });
        }
        setBatchProgress(null);
        setIsDirty(true); if (savedFilePathRef.current) setFileSynced(false);
        toast(
            skipped > 0
                ? `${valid.length} photo${valid.length !== 1 ? 's' : ''} added · ${skipped} skipped (unsupported format)`
                : `${valid.length} photo${valid.length !== 1 ? 's' : ''} added`,
            skipped > 0 ? 'info' : 'success'
        );
    };

    const handleFileDragOver = (e: React.DragEvent) => {
        if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            e.stopPropagation();
            setIsDroppingFiles(true);
        }
    };

    const handleFileDragLeave = (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDroppingFiles(false);
        }
    };

    const handleFileDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDroppingFiles(false);
        if (e.dataTransfer.files.length > 0) {
            handleBatchImport(e.dataTransfer.files);
        }
    };

    const addPhoto = (insertAtIndex?: number) => {
        const newId = photosData.length > 0 ? Math.max(...photosData.map(p => p.id)) + 1 : 1;
        const newPhoto: PhotoData = {
            id: newId,
            photoNumber: '',
            date: '',
            location: '',
            description: '',
            imageUrl: null,
            direction: '',
            isMap: false,
        };
        
        setPhotosData(prev => {
            let newPhotos;
            if (insertAtIndex !== undefined) {
                const insertionPoint = insertAtIndex + 1;
                newPhotos = [...prev.slice(0, insertionPoint), newPhoto, ...prev.slice(insertionPoint)];
            } else {
                newPhotos = [...prev, newPhoto];
            }
            return renumberPhotos(newPhotos);
        });
        setIsDirty(true); if (savedFilePathRef.current) setFileSynced(false);
    };

    const removePhoto = useCallback((id: number) => {
        setPhotosData(prev => {
            const photoToRemove = prev.find(p => p.id === id);
            if (photoToRemove && photoToRemove.imageId) {
                deleteImage(photoToRemove.imageId).catch(err => console.error("Failed to delete image from DB", err));
                if (photoToRemove.imageUrl) revokeImageUrl(photoToRemove.imageUrl);
            }
            return renumberPhotos(prev.filter(photo => photo.id !== id));
        });
        setIsDirty(true); if (savedFilePathRef.current) setFileSynced(false);
    }, []);

    const handlePhotoDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (active.id !== over?.id) {
            const oldIndex = photosData.findIndex(p => p.id === active.id);
            const newIndex = photosData.findIndex(p => p.id === over!.id);
            setPhotosData(renumberPhotos(arrayMove(photosData, oldIndex, newIndex)));
            setIsDirty(true); if (savedFilePathRef.current) setFileSynced(false);
        }
    };

   const prepareStateForRecentProjectStorage = async (dataToStore: DfrSaskpowerData) => {
    const photosForStorage = await Promise.all(
        photosData.map(async (photo) => {
            // Keep imageUrl embedded so Recent Projects work offline
            if (photo.imageUrl) {
                const imageId =
                    photo.imageId ||
                    `${dataToStore.projectNumber || 'proj'}-${photo.id}-${Date.now()}`;

                // IndexedDB is optional cache
                try {
                    await storeImage(imageId, photo.imageUrl);
                } catch (e) {
                    console.warn('Failed to cache image in IndexedDB', e);
                }

                return {
                    ...photo,
                    imageId,
                    imageUrl: null, // stored separately in images store; hydrated on load
                };
            }

            return photo;
            })
        );
        return { ...dataToStore, photosData: photosForStorage };
    };

    const validateForm = (): boolean => {
        const newErrors = new Set<string>();
        const requiredFields: (keyof DfrSaskpowerData)[] = [
            'date', 'location', 'projectName', 'vendorAndForeman', 
            'projectNumber', 'environmentalMonitor', 'envFileNumber', 
            'generalActivity', 'totalHoursWorked', 'equipmentOnsite', 
            'weatherAndGroundConditions', 'environmentalProtection', 
            'wildlifeObservations', 'futureMonitoring',
            'completedTailgate', 'reviewedTailgate', 'reviewedPermits'
        ];

        requiredFields.forEach(field => {
            const value = data[field];
            if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) {
                newErrors.add(field);
            }
        });

        photosData.filter(p => p.imageUrl || p.imageId).forEach(photo => {
            const prefix = `photo-${photo.id}-`;
            if (!photo.date) newErrors.add(`${prefix}date`);
            if (!photo.location) newErrors.add(`${prefix}location`);
            if (!photo.description) newErrors.add(`${prefix}description`);
            if (!photo.imageUrl) newErrors.add(`${prefix}imageUrl`);
            if (!photo.isMap && !photo.direction) newErrors.add(`${prefix}direction`);
        });

        setErrors(newErrors);
        if (newErrors.size > 0) {
            setShowValidationErrorModal(true);
            return false;
        }
        return true;
    };

    const addSafeLogo = async (docInstance: any, x: number, y: number, w: number, h: number) => {
        try {
            const logoUrl = await getAssetUrl("xterra-logo.jpg");
            const response = await fetch(logoUrl);
            if (!response.ok) throw new Error('Logo fetch failed');
            const blob = await response.blob();
            const reader = new FileReader();
            return new Promise<void>((resolve) => {
                reader.onloadend = () => {
                    const base64data = reader.result as string;
                    docInstance.addImage(base64data, 'JPEG', x, y, w, h);
                    resolve();
                };
                reader.onerror = () => {
                    console.error("FileReader failed to read logo");
                    resolve();
                };
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error("Could not load logo:", e);
            // Fallback: draw text if logo fails
            docInstance.setFontSize(10);
            docInstance.setTextColor(0,0,0);
            docInstance.text("X-TERRA", x, y + 5);
        }
    };

    const handleSavePdf = async () => {
        // Removed internet check to allow offline PDF generation
        if (!validateForm()) return;

        // Show loading indicator
        setStatusMessage('Generating PDF...');
        setShowStatusModal(true);

        // Allow UI to update before heavy processing
        await new Promise(resolve => setTimeout(resolve, 50));

        try {
        const stateForSaving = await prepareStateForRecentProjectStorage(data);
        const formattedDate = formatDateForRecentProject(data.date);
        const dateSuffix = formattedDate ? ` - ${formattedDate}` : '';
        const projectName = `${data.projectName || 'Untitled SaskPower DFR'}${dateSuffix}`;
        await addRecentProject(stateForSaving, { type: 'dfrSaskpower', name: projectName, projectNumber: data.projectNumber, proponent: data.proponent, date: data.date });

        perfMark('pdf-gen-start');
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'letter' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        
        const borderMargin = 12.7;
        const contentPadding = 4;
        const contentMargin = borderMargin + contentPadding;
        const contentWidth = pageWidth - contentMargin * 2;
        
        const maxYPos = pageHeight - contentMargin;
        let pageNum = 1;

        // --- PDF Drawing State and Helpers ---
        let bufferedDraws: ((doc: any) => void)[] = [];
        let sectionStartYOnPage = -1;

        const flushDrawBuffer = (docInstance: any, endY: number) => {
            if (bufferedDraws.length > 0 && sectionStartYOnPage !== -1) {
                bufferedDraws.forEach(draw => draw(docInstance));
            }
            bufferedDraws = [];
            sectionStartYOnPage = -1;
        };

        const drawPageBorder = (docInstance: any) => {
            docInstance.setDrawColor(0, 125, 140);
            docInstance.setLineWidth(0.5);
            const startX = borderMargin;
            const endX = pageWidth - borderMargin;
            const bottomY = pageHeight - borderMargin;
      // Bottom line adjustments and spacing
           const BOTTOM_LINE_NUDGE_UP = 4; // mm (use 0.5–2)

            docInstance.line(
            startX,
            bottomY - BOTTOM_LINE_NUDGE_UP,
            endX,
            bottomY - BOTTOM_LINE_NUDGE_UP
);
        };
        
        const drawProjectInfoBlock = (docInstance: any, startY: number, options: { drawTopLine?: boolean, drawBottomLine?: boolean } = {}) => {
            const { drawTopLine = true, drawBottomLine = true } = options;
            const blockPaddingTop = 6;
            const blockPaddingBottom = -1;
            docInstance.setFontSize(12);
            let yPos = startY + blockPaddingTop;

            const drawField = (label: string, value: string, x: number, y: number, maxWidth: number): number => {
                const labelText = `${(label || '').toUpperCase()}:`;
                docInstance.setFont('times', 'bold');
                const labelWidth = docInstance.getTextWidth(labelText);
                docInstance.text(labelText, x, y);
                
                docInstance.setFont('times', 'normal');
                const valueMaxWidth = maxWidth - labelWidth - 2;
                const valueLines = docInstance.splitTextToSize(value || ' ', valueMaxWidth);
                docInstance.text(valueLines, x + labelWidth + 2, y);
                
                return docInstance.getTextDimensions(valueLines).h;
            };

            const col1X = contentMargin;
            const col1MaxWidth = contentWidth * 0.5 - 2;
            const col2X = contentMargin + contentWidth * 0.5 + 2;
            const col2MaxWidth = contentWidth * 0.5 - 2;
            const fieldGap = 1.5;

            // Define fields for each column
            const col1Fields = [
                { label: 'PROPONENT', value: data.proponent },
                { label: 'PROJECT', value: data.projectName },
                { label: 'LOCATION', value: data.location },
                { label: 'ENV FILE NUMBER', value: data.envFileNumber },
            ];

            const col2Fields = [
                { label: 'DATE', value: data.date },
                { label: 'X-TERRA PROJECT #', value: data.projectNumber },
                { label: 'MONITOR', value: data.environmentalMonitor },
                { label: 'VENDOR', value: data.vendorAndForeman },
            ];

            let yPos1 = yPos;
            let yPos2 = yPos;

            // Draw column 1
            col1Fields.forEach(field => {
                const height = drawField(field.label, field.value, col1X, yPos1, col1MaxWidth);
                yPos1 += height + fieldGap;
            });

            // Draw column 2
            col2Fields.forEach(field => {
                const height = drawField(field.label, field.value, col2X, yPos2, col2MaxWidth);
                yPos2 += height + fieldGap;
            });

            // Final Y position is the max of the two columns
            yPos = Math.max(yPos1, yPos2);
            
            const blockBottomY = yPos + blockPaddingBottom;
            
            docInstance.setDrawColor(0, 125, 140);
            docInstance.setLineWidth(0.5);
            if (drawTopLine) docInstance.line(borderMargin, startY, pageWidth - borderMargin, startY);
            if (drawBottomLine) docInstance.line(borderMargin, blockBottomY, pageWidth - borderMargin, blockBottomY);
            return blockBottomY;
        };
        
        const drawDfrHeader = async (docInstance: any) => {
            const headerContentStartY = contentMargin;
            // Use addSafeLogo instead of direct addImage
            await addSafeLogo(docInstance, contentMargin, headerContentStartY, 40, 10);
            
            docInstance.setFontSize(18);
            docInstance.setFont('times', 'bold');
            docInstance.setTextColor(0, 125, 140);
            docInstance.text('DAILY FIELD REPORT', pageWidth / 2, headerContentStartY + 7, { align: 'center' });
            
            docInstance.setTextColor(0, 0, 0);
            let yPos = headerContentStartY + 15;
            yPos = drawProjectInfoBlock(docInstance, yPos);
            return yPos + 4;
        };
        
        
const renderTextSection = async (
    doc: any,
    currentY: number,
    title: string,
    content: string,
    options: { spaceBefore?: number; box?: boolean; forceNewPage?: boolean } = {}
) => {
    const { spaceBefore = 4, box = false, forceNewPage = false } = options;

    if (!content || !content.trim()) return currentY;

    let y = currentY + spaceBefore;

    // -------------------------------------------------------------------
    // OPTION 2 — FORCE ENTIRE SECTION TO START ON A NEW PAGE
    // -------------------------------------------------------------------
    if (forceNewPage) {
        flushDrawBuffer(doc, y);
        drawPageBorder(doc);
        doc.addPage();
        pageNum++;
        y = await drawDfrHeader(doc);
    }

    // -------------------------------------------------------------------
    // 1. BEFORE PRINTING THE HEADER, CHECK IF THERE IS ROOM FOR HEADER + BODY
    // -------------------------------------------------------------------
    const headerHeight = doc.getTextDimensions(title).h + 6;
    const minimumBodyHeight = 12; // space for one body line

    if (y + headerHeight + minimumBodyHeight > maxYPos) {
        flushDrawBuffer(doc, y);
        drawPageBorder(doc);
        doc.addPage();
        pageNum++;

        // Redraw PDF header
        y = await drawDfrHeader(doc);
    }

    // -------------------------------------------------------------------
    // 2. PRINT SECTION TITLE (ONLY ONCE)
    // -------------------------------------------------------------------
    doc.setFont("times", "bold");
    doc.setFontSize(13);

    const titleHeight = doc.getTextDimensions(title).h;
    const titleY = y + (box ? 4 : 0);

    doc.text(title, contentMargin + (box ? 2 : 0), titleY);

    // Move down below header
    y = titleY + titleHeight + 2;

    // Track box boundaries
    let boxStartY = titleY - (box ? 4 : 0);
    let boxEndY = y;

    // -------------------------------------------------------------------
    // 3. BODY TEXT STYLING
    // -------------------------------------------------------------------
    doc.setFont("times", "normal");
    doc.setFontSize(12);

    const lines = content.split("\n");

    // -------------------------------------------------------------------
    // 4. RENDER BODY LINES WITH CORRECT PAGE BREAK LOGIC
    // -------------------------------------------------------------------
    for (const line of lines) {
        // Blank line → small spacing
        if (line.trim() === "") {
            y += 4;
            boxEndY = y;
            continue;
        }

        // Determine indent from leading spaces
        const match = line.match(/^\s*/);
        const indentSpaces = match ? match[0].length : 0;
        const indentLevel = Math.floor(indentSpaces / 2);
        const indentWidth = indentLevel * 5;

        const trimmed = line.trim();
        const isBullet = trimmed.startsWith("-");
        const textContent = isBullet ? trimmed.slice(1).trim() : trimmed;

        const maxWidth =
            contentWidth -
            indentWidth -
            (isBullet ? 5 : 0) -
            (box ? 4 : 0);

        const split = doc.splitTextToSize(textContent, maxWidth);
        const textHeight = doc.getTextDimensions(split).h + 2;

        // -------------------------------------------------------------------
        // PAGE BREAK HANDLING — CONTINUATION TEXT MUST LOOK NORMAL
        // -------------------------------------------------------------------
        if (y + textHeight > maxYPos) {
            flushDrawBuffer(doc, y);
            drawPageBorder(doc);
            doc.addPage();
            pageNum++;

            // Reset to top of new page content area
            y = await drawDfrHeader(doc);

            // RESET FONT STATE (fixes bold bleed)
            doc.setFont("times", "normal");
            doc.setFontSize(12);

            // Reset box boundary for continuation
            boxStartY = y;
        }

        // Render bullet or text
        const renderY = y;

        let textX =
            contentMargin +
            indentWidth +
            (box ? 2 : 0) +
            (isBullet ? 5 : 0);

        if (isBullet) {
            const bulletX = contentMargin + indentWidth + (box ? 2 : 0);
            doc.text("-", bulletX, renderY);
        }

        doc.text(split, textX, renderY);

        y += textHeight;
        boxEndY = y;
    }

    // -------------------------------------------------------------------
    // 5. DRAW BOX AROUND ENTIRE SECTION (IF USED)
    // -------------------------------------------------------------------
    if (box) {
        const h = boxEndY - boxStartY + 4;
        doc.setDrawColor(128, 128, 128);
        doc.setLineWidth(0.25);
        doc.rect(contentMargin, boxStartY, contentWidth, h);
    }

    return box ? y + 4 : y;
};





        
        let yPos = await drawDfrHeader(doc);
        
        yPos = await renderTextSection(doc, yPos, 'Project Activities (detailed description with timestamps):', data.generalActivity);
        flushDrawBuffer(doc, yPos);
        
        const otherTextSections = [
            { title: 'X-Terra Equipment Onsite:', content: data.equipmentOnsite },
            { title: 'Weather and Ground Conditions:', content: data.weatherAndGroundConditions },
            { title: 'Environmental Protection Measures and Mitigation:', content: data.environmentalProtection },
            { title: 'Wildlife Observations:', content: data.wildlifeObservations },
            { title: 'Future Monitoring Requirements:', content: data.futureMonitoring },
        ];
        
        for (const { title, content } of otherTextSections) {
            yPos = await renderTextSection(doc, yPos, title, content);
            flushDrawBuffer(doc, yPos);
        }

        const checklistItems = [
            { label: 'Completed/Reviewed X-Terra Tailgate:', value: data.completedTailgate },
            { label: 'Reviewed/Signed Crew Tailgate:', value: data.reviewedTailgate },
            { label: 'Reviewed Permit(s) with Crew(s):', value: data.reviewedPermits },
        ];
        
        const checklistSectionHeight = 4 + (checklistItems.length * 8) + 10;
        if (yPos + checklistSectionHeight > maxYPos) {
            drawPageBorder(doc); doc.addPage(); pageNum++; yPos = await drawDfrHeader(doc);
        }
        
        sectionStartYOnPage = yPos + 4;
        yPos += 4;
        
        checklistItems.forEach(item => { 
            const itemY = yPos;
            bufferedDraws.push(d => {
                const options: ChecklistOption[] = ['Yes', 'No', 'NA'];
                const circleRadius = 1.5; const spaceBetweenOptions = 20;
                d.setFontSize(10); d.setFont('times', 'normal'); d.text(item.label, contentMargin, itemY);
                d.setLineWidth(0.25); d.setDrawColor(0, 0, 0); d.setTextColor(0, 0, 0);
                let currentX = pageWidth - contentMargin - (options.length * spaceBetweenOptions);
                options.forEach(option => {
                    const circleY = itemY - circleRadius / 2;
                    if (option === item.value) { d.setFillColor(0, 125, 140); d.circle(currentX, circleY, circleRadius, 'FD'); }
                    else { d.circle(currentX, circleY, circleRadius, 'S'); }
                    d.text(option, currentX + circleRadius + 2, itemY);
                    currentX += spaceBetweenOptions;
                });
            });
            yPos += 8;
        });

        const hoursY = yPos + 4;
        bufferedDraws.push(d => {
            d.setFontSize(10); d.setFont('times', 'bold');
            d.text(`Total Hours Worked: ${data.totalHoursWorked}`, contentMargin, hoursY);
        });
        yPos = hoursY + doc.getTextDimensions(`Total Hours Worked: ${data.totalHoursWorked}`).h;
        flushDrawBuffer(doc, yPos);


        drawPageBorder(doc);
        
        // --- Photo Log Section ---
        const drawPhotoPageHeader = async (docInstance: any) => {
            const startY = borderMargin;
            docInstance.setDrawColor(0, 125, 140);
            docInstance.setLineWidth(0.5);
            docInstance.line(borderMargin, startY, pageWidth - borderMargin, startY);
            const yAfterBlock = drawProjectInfoBlock(docInstance, startY, { drawTopLine: false });
            return yAfterBlock + 1;
        };

        const sitePhotos = photosData.filter(p => !p.isMap && p.imageUrl);
        const mapPhotosData = photosData.filter(p => p.isMap && p.imageUrl);
        
        const SP_PHOTO_GAP = 5;
        const SP_PHOTO_TEXT_WIDTH = (contentWidth - SP_PHOTO_GAP) * 0.33;
        const SP_PHOTO_IMAGE_WIDTH = (contentWidth - SP_PHOTO_GAP) * 0.73;
        const SP_PHOTO_IMAGE_HEIGHT = SP_PHOTO_IMAGE_WIDTH * (3 / 4);
        const SP_PHOTO_IMAGE_X = contentMargin + SP_PHOTO_TEXT_WIDTH + SP_PHOTO_GAP - 5;

        const calculatePhotoEntryHeight = (docInstance: any, photo: PhotoData): number => {
                    docInstance.setFontSize(12);
                    let textHeight = 0;
                    const textMetrics = docInstance.getTextDimensions('Photo');
                    textHeight += textMetrics.h * 0.75;

                    const measureField = (label: string, value: string) => {
                        const labelText = `${label}:`;
                        docInstance.setFont('times', 'bold');
                        const labelWidth = docInstance.getTextWidth(labelText);
                        docInstance.setFont('times', 'normal');
                        const valueMaxWidth = SP_PHOTO_TEXT_WIDTH - labelWidth - 2;
                        const valueLines = docInstance.splitTextToSize(value || ' ', valueMaxWidth);
                        return docInstance.getTextDimensions(valueLines).h + 1.5;
                    };

                    textHeight += measureField(photo.isMap ? "Map" : "Photo", photo.photoNumber);
                    if (!photo.isMap) textHeight += measureField("Direction", photo.direction || 'N/A');
                    textHeight += measureField("Date", photo.date);
                    textHeight += measureField("Location", photo.location);
                    textHeight += 5;
                    const descLines = docInstance.splitTextToSize(photo.description || ' ', SP_PHOTO_TEXT_WIDTH - 10);
                    textHeight += docInstance.getTextDimensions(descLines).h;

                    return Math.max(textHeight, photo.imageUrl ? SP_PHOTO_IMAGE_HEIGHT : 0);
                };
                
                const drawPhotoEntryText = (docInstance: any, photo: PhotoData, xStart: number, yStart: number, textBlockWidth: number) => {
                    docInstance.setFontSize(12);
                    docInstance.setFont('times', 'normal');
        
                    const textMetrics = docInstance.getTextDimensions('Photo');
                    const ascent = textMetrics.h * 0.75;
                    let textY = yStart + ascent;
        
                    const drawTextField = (label: string, value: string) => {
                        docInstance.setFont('times', 'bold');
                        const labelText = `${label}:`;
                        docInstance.text(labelText, xStart, textY);
                        
                        docInstance.setFont('times', 'normal');
                        const labelWidth = docInstance.getTextWidth(labelText);
                        const valueMaxWidth = textBlockWidth - labelWidth - 2;
                        const valueLines = docInstance.splitTextToSize(value || ' ', valueMaxWidth);
                        docInstance.text(valueLines, xStart + labelWidth + 2, textY);
                        textY += docInstance.getTextDimensions(valueLines).h + 1.5;
                    };
        
                    drawTextField(photo.isMap ? "Map" : "Photo", photo.photoNumber);
                    if (!photo.isMap) drawTextField("Direction", photo.direction || 'N/A');
                    drawTextField("Date", photo.date);
                    drawTextField("Location", photo.location);
        
                    docInstance.setFont('times', 'bold');
                    docInstance.text(`Description:`, xStart, textY);
                    textY += 5;
                    docInstance.setFont('times', 'normal');
                    const descLines = docInstance.splitTextToSize(photo.description || ' ', textBlockWidth - 10);
                    docInstance.text(descLines, xStart, textY);
                };
                
                const drawPhotoEntry = (docInstance: any, photo: PhotoData, yStart: number) => {
                    drawPhotoEntryText(docInstance, photo, contentMargin, yStart, SP_PHOTO_TEXT_WIDTH);
                    if (photo.imageUrl) {
                        docInstance.addImage(photo.imageUrl, 'JPEG', SP_PHOTO_IMAGE_X, yStart, SP_PHOTO_IMAGE_WIDTH, SP_PHOTO_IMAGE_HEIGHT);
                    }
                };
        
                if (sitePhotos.length > 0) {
                    setStatusMessage(`Processing ${sitePhotos.length} photo(s)...`);
                    await new Promise(resolve => setTimeout(resolve, 10));
                    const entryHeights = sitePhotos.map(p => calculatePhotoEntryHeight(doc, p));
                    const dummyDoc = new jsPDF();
                    const yAfterHeader = await drawPhotoPageHeader(dummyDoc);
                    const pageContentHeight = maxYPos - yAfterHeader;
                    
                    const pages: number[][] = [];
                    let currentPageGroup: number[] = [];
                    let currentHeight = 0;
        
                    sitePhotos.forEach((_, i) => {
                        const photoHeight = entryHeights[i];
                        if (currentPageGroup.length === 0) {
                            currentPageGroup.push(i);
                            currentHeight = photoHeight;
                        } else if (currentPageGroup.length === 1) {
                            if (currentHeight + photoHeight + 10 <= pageContentHeight) { 
                                currentPageGroup.push(i);
                            } else {
                                pages.push(currentPageGroup);
                                currentPageGroup = [i];
                                currentHeight = photoHeight;
                            }
                        }
                        
                        if (currentPageGroup.length === 2) {
                            pages.push(currentPageGroup);
                            currentPageGroup = [];
                            currentHeight = 0;
                        }
                    });
        
                    if (currentPageGroup.length > 0) pages.push(currentPageGroup);
        
                    let isFirstPhotoPage = true;
                    for (const group of pages) {
                        doc.addPage(); pageNum++;
                        isFirstPhotoPage = false;
                        
                        let yPos = await drawPhotoPageHeader(doc);
                        const photosOnPage = group.map(i => sitePhotos[i]);
                        const heightsOnPage = group.map(i => entryHeights[i]);
                        const availableHeight = maxYPos - yPos;
        
                        if (photosOnPage.length === 1) {
                            drawPhotoEntry(doc, photosOnPage[0], yPos);
                        } else {
                            const totalContentHeight = heightsOnPage.reduce((sum, h) => sum + h, 0);
                            const tightGap = 4; // The smaller gap above photos
                            
                            const totalRemainingSpace = availableHeight - totalContentHeight - (tightGap * 2);
                            const largeGap = totalRemainingSpace > 0 ? totalRemainingSpace / 2 : 2;
        
                            // Position first photo
                            yPos += tightGap;
                            drawPhotoEntry(doc, photosOnPage[0], yPos);
                            yPos += heightsOnPage[0];
        
                            // Position separator line
                            yPos += largeGap;
                            doc.setDrawColor(0, 125, 140); // Teal
                            doc.setLineWidth(0.5);
                            const MIDDLE_LINE_NUDGE = -2; // mm (negative = up, positive = down)
                            doc.line(
                                borderMargin,
                                yPos + MIDDLE_LINE_NUDGE,
                                pageWidth - borderMargin,
                                yPos + MIDDLE_LINE_NUDGE
                    );
                            // Position second photo
                            yPos += tightGap;
                            drawPhotoEntry(doc, photosOnPage[1], yPos);
                        }
                        drawPageBorder(doc);
                    }
                }
        const calculateMapTextHeight = (docInstance: any, photo: PhotoData, textBlockWidth: number): number => {
            let height = 0; docInstance.setFontSize(12); docInstance.setFont('times', 'normal'); const textMetrics = docInstance.getTextDimensions('Photo'); height += textMetrics.h * 0.75;
            const measureField = (label: string, value: string) => {
                docInstance.setFont('times', 'bold'); const labelText = `${label}:`; const labelWidth = docInstance.getTextWidth(labelText);
                docInstance.setFont('times', 'normal'); const valueMaxWidth = textBlockWidth - labelWidth - 2;
                const valueLines = docInstance.splitTextToSize(value || ' ', valueMaxWidth); return docInstance.getTextDimensions(valueLines).h + 1.5;
            };
            height += measureField("Map", photo.photoNumber); height += measureField("Date", photo.date); height += measureField("Location", photo.location);
            height += 5; const descLines = docInstance.splitTextToSize(photo.description || ' ', textBlockWidth - 10); height += docInstance.getTextDimensions(descLines).h; return height;
        };

        if (mapPhotosData.length > 0) {
            for (const map of mapPhotosData) {
                doc.addPage(); pageNum++; let yPosMap = await drawPhotoPageHeader(doc);
                const footerAndGapHeight = 25; const textBlockHeight = calculateMapTextHeight(doc, map, contentWidth);
                const availableHeightForImage = pageHeight - yPosMap - footerAndGapHeight - textBlockHeight; const availableWidthForImage = contentWidth; let yPosAfterImage = yPosMap;
                if (map.imageUrl) {
                    const { width: imgW, height: imgH } = await getImageDimensions(map.imageUrl);
                    const ratio = Math.min(availableWidthForImage / imgW, availableHeightForImage / imgH);
                    const drawWidth = imgW * ratio; const drawHeight = imgH * ratio; const drawX = contentMargin + (availableWidthForImage - drawWidth) / 2;
                    doc.addImage(map.imageUrl, 'JPEG', drawX, yPosMap, drawWidth, drawHeight); yPosAfterImage = yPosMap + drawHeight + 8;
                }
                drawPhotoEntryText(doc, map, contentMargin, yPosAfterImage, contentWidth); drawPageBorder(doc);
            }
        }

        const sanitize = (name: string) => name.replace(/[^a-z0-9_]/gi, '-').toLowerCase();
        const filename = `${sanitize(data.projectNumber) || 'project'}_SaskPower_DFR.pdf`;
        const totalPages = (doc.internal as any).getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i); doc.setFontSize(10); doc.setFont('times', 'normal'); doc.setTextColor(0, 0, 0);
            const footerTextY = pageHeight - borderMargin + 4; doc.text(`Page ${i} of ${totalPages}`, pageWidth - borderMargin, footerTextY, { align: 'right' });
        }
        
        perfMark('pdf-gen-end');
        perfMeasure('PDF generation (DfrSaskpower)', 'pdf-gen-start', 'pdf-gen-end');
        const pdfBlob = doc.output('blob');
        if (initialData?.autoPdfExport) {
            const ab = await pdfBlob.arrayBuffer();
            // @ts-ignore
            if (window.electronAPI?.savePdf) { // @ts-ignore
                await window.electronAPI.savePdf(ab, filename);
            }
            (onBackDirect ?? onBack)();
            return;
        }
        setPdfPreview({ blob: pdfBlob, filename });
        } finally {
            setShowStatusModal(false);
        }
    };

    // Core save — works like Word/Excel Ctrl+S.
    // First call with no file path → shows Save dialog.
    // All subsequent calls → writes directly to the same file.
    const performSave = async (currentData: DfrSaskpowerData) => {
        if (isSavingRef.current) return;
        isSavingRef.current = true;
        setIsSyncing(true);
        try {
            const photosForExport = photosDataRef.current.map(({ imageId, ...p }) => p);
            const filePayload = JSON.stringify({ ...currentData, photosData: photosForExport });
            let filePath = savedFilePathRef.current;

            if (!filePath) {
                // No file linked yet — show Save dialog (Word behaviour: first Ctrl+S)
                const sanitize = (s: string) => s.replace(/[^a-z0-9_]/gi, '-').toLowerCase();
                const fname = `${sanitize(currentData.projectName || 'project')}_${formatDateForFilename(currentData.date)}.spdfr`;
                // @ts-ignore
                const result = await window.electronAPI?.saveProject?.(filePayload, fname);
                if (!result?.path) return; // user cancelled dialog
                filePath = result.path;
                savedFilePathRef.current = filePath;
            } else {
                // Path known — write directly, no dialog (Word behaviour: subsequent Ctrl+S)
                // @ts-ignore
                if ((window as any).electronAPI?.writeToFile) {
                    const writeResult = await (window as any).electronAPI.writeToFile(filePayload, filePath);
                    if (writeResult && !writeResult.success) {
                        throw new Error(writeResult.error || 'Could not write to file');
                    }
                } else {
                    // Fallback if handler not yet loaded (restart app to get write-to-file)
                    // @ts-ignore
                    await window.electronAPI?.saveProject?.(filePayload, filePath);
                }
            }

            // Persist file path immediately after successful write — use any known timestamp
            const persistPath = (ts: number | string | null | undefined, path: string) => {
                if (!ts || !path) return;
                try { const m=JSON.parse(localStorage.getItem('xtec_file_paths')?? '{}'); m[String(ts)]=path; localStorage.setItem('xtec_file_paths',JSON.stringify(m)); } catch {}
            };
            const knownTs = projectTimestampRef.current ?? (initialData as any)?.timestamp;
            persistPath(knownTs, filePath!);

            // Update recent projects list (non-critical — don't let it abort the save)
            try {
            const stateForRecent = await prepareStateForRecentProjectStorage(currentData);
            const formattedDate = formatDateForRecentProject(currentData.date);
            const dateSuffix = formattedDate ? ` - ${formattedDate}` : '';
            const projectName = `${currentData.projectName || 'Untitled SaskPower DFR'}${dateSuffix}`;
            const savedTs = await addRecentProject(stateForRecent, { type: 'dfrSaskpower', name: projectName, projectNumber: currentData.projectNumber, proponent: currentData.proponent, date: currentData.date }, projectTimestampRef.current ?? undefined);
            if (savedTs) {
                projectTimestampRef.current = savedTs;
                persistPath(savedTs, filePath!); // also store under the canonical Recent Projects timestamp
            }
            } catch (recentsErr) {
                console.warn('Recent projects update failed (file was saved):', recentsErr);
            }

            setIsDirty(false);
            setFileSynced(true);
            setAutosaveEnabled(true);
            setLastSyncedAt(new Date());
            setJustSaved(true);
            if (justSavedTimeoutRef.current) clearTimeout(justSavedTimeoutRef.current);
            justSavedTimeoutRef.current = setTimeout(() => setJustSaved(false), 2500);
            toast('Saved ✓');
        } catch (e) {
            console.error('Save failed:', e);
            toast(`Save failed — ${e instanceof Error ? e.message : 'please try again.'}`, 'error');
        } finally {
            isSavingRef.current = false;
            setIsSyncing(false);
        }
    };

    const handleQuickSave = async () => {
        if (isSavingRef.current) return;
        // If no project info yet, collect it first (like Word prompting for document title)
        if (!data.projectName.trim() && !data.projectNumber.trim() && !savedFilePathRef.current) {
            setFirstSaveHeader({ proponent: data.proponent, projectName: data.projectName, location: data.location, date: data.date, projectNumber: data.projectNumber });
            setShowFirstSaveModal(true);
            return;
        }
        await performSave(data);
    };

    const handleConfirmFirstSave = async () => {
        setShowFirstSaveModal(false);
        const mergedData = { ...data, ...firstSaveHeader };
        setData(d => ({ ...d, ...firstSaveHeader }));
        await performSave(mergedData);
    };
    quickSaveRef.current = handleQuickSave;
    savePdfRef.current = handleSavePdf;

    useEffect(() => {
        if (!initialData?.autoPdfExport) return;
        const t = setTimeout(() => handleSavePdf(), 400);
        return () => clearTimeout(t);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSaveProject = async () => {
        // Save As — always shows the dialog so user can pick a new location
        if (isSavingRef.current) return;
        isSavingRef.current = true;
        try {
        const photosForExport = photosData.map(({ imageId, ...photo }) => photo);
        const stateForFileExport = { ...data, photosData: photosForExport };
        const sanitize = (name: string) => name.replace(/[^a-z0-9_]/gi, '-').toLowerCase();
        const formattedFilenameDate = formatDateForFilename(data.date);
        const sanitizedProjectName = sanitize(data.projectName);
        const filename = `${sanitizedProjectName || 'project'}_${formattedFilenameDate}.spdfr`;
        // @ts-ignore
        if (window.electronAPI) {
            // @ts-ignore
            const result = await window.electronAPI.saveProject(JSON.stringify(stateForFileExport), savedFilePathRef.current || filename);
            if (result?.path) {
                savedFilePathRef.current = result.path;
                projectTimestampRef.current = null; // detach from old entry — next save creates a new one
                setIsDirty(false);
                setFileSynced(true);
                setAutosaveEnabled(true);
                setLastSyncedAt(new Date());
                setJustSaved(true);
                if (justSavedTimeoutRef.current) clearTimeout(justSavedTimeoutRef.current);
                justSavedTimeoutRef.current = setTimeout(() => setJustSaved(false), 2500);
                toast('Saved ✓');
            }
        } else {
            const blob = new Blob([JSON.stringify(stateForFileExport)], { type: 'application/json;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
        }
        } finally { isSavingRef.current = false; }
    };

    saveProjectRef.current = handleSaveProject;

    // New Day — copies current report with today's date, starts as new unsaved draft
    const handleNewDay = () => {
        const todayStr = new Date().toLocaleDateString('en-CA', { year:'numeric', month:'long', day:'numeric' });
        setData(d => ({ ...d, date: todayStr }));
        savedFilePathRef.current = null;
        projectTimestampRef.current = null;
        setIsDirty(true);
        setFileSynced(null);
        setAutosaveEnabled(false);
        toast(`New draft for ${todayStr} — click Save to save it`);
    };

    // Save a Copy — saves current content to a NEW file, keeps working on original
    const handleSaveCopy = async () => {
        if (isSavingRef.current) return;
        isSavingRef.current = true;
        try {
            const photosForExport = photosData.map(({ imageId, ...p }) => p);
            const stateForCopy = { ...data, photosData: photosForExport };
            const sanitize = (s: string) => s.replace(/[^a-z0-9_]/gi, '-').toLowerCase();
            const fname = `${sanitize(data.projectName || 'project')}_copy_${sanitize(data.date || 'date')}.spdfr`;
            // @ts-ignore
            await window.electronAPI?.saveProject?.(JSON.stringify(stateForCopy), fname);
            toast('Copy saved ✓');
        } catch (e) {
            console.error('Save copy failed:', e);
        } finally {
            isSavingRef.current = false;
        }
    };

    const handleDownloadPhotos = useCallback(async () => {
        if (isDownloadingRef.current) return;
        isDownloadingRef.current = true;
    
        try {
            setStatusMessage('Checking for photos...');
            setShowStatusModal(true);
            await new Promise(resolve => setTimeout(resolve, 100));
    
            const photosWithImages = photosData.filter(p => p.imageUrl);
    
            if (photosWithImages.length === 0) {
                setStatusMessage('No photos found to download.');
                await new Promise(resolve => setTimeout(resolve, 2000));
                setShowStatusModal(false);
                return;
            }
    
            setStatusMessage(`Preparing ${photosWithImages.length} photos...`);
            await new Promise(resolve => setTimeout(resolve, 100));
    
            const zip = new JSZip();
            let metadata = '';
            const sanitizeFilename = (name: string) => name.replace(/[^a-z0-9_.\-]/gi, '_');
    
            for (const photo of photosWithImages) {
                const photoNumberSanitized = sanitizeFilename(photo.photoNumber);
                const filename = `${photoNumberSanitized}.jpg`;
    
                metadata += `---
File: ${filename}
Photo Number: ${photo.photoNumber}
Date: ${photo.date || 'N/A'}
Location: ${photo.location || 'N/A'}
Direction: ${photo.direction || 'N/A'}
Description: ${photo.description || 'N/A'}
---\n\n`;
    
                const response = await fetch(photo.imageUrl!);
                const blob = await response.blob();
                zip.file(filename, blob);
            }
    
            zip.file('metadata.txt', metadata);
            
            setStatusMessage('Creating zip file...');
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const sanitize = (name: string) => name.replace(/[^a-z0-9_]/gi, '-').toLowerCase();
            const zipFilename = `${sanitize(data.projectNumber) || 'project'}_${sanitize(data.projectName) || 'saskpower-dfr'}_Photos.zip`;
            
            // @ts-ignore
            if (window.electronAPI?.saveZipFile) {
                const buffer = await zip.generateAsync({ type: 'arraybuffer' });
                // @ts-ignore
                await window.electronAPI.saveZipFile(buffer, zipFilename);
            } else {
                const zipBlob = await zip.generateAsync({ type: 'blob' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(zipBlob);
                link.setAttribute('download', zipFilename);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);
            }
    
        } finally {
            setShowStatusModal(false);
            isDownloadingRef.current = false;
        }
    }, [photosData, data]);

    // Create a ref to hold the latest handler function.
    const downloadHandlerRef = useRef(handleDownloadPhotos);
    useEffect(() => {
        downloadHandlerRef.current = handleDownloadPhotos;
    }, [handleDownloadPhotos]);

    // Create a stable listener function that always calls the latest handler from the ref.
    const stableListener = useCallback(() => {
        if (downloadHandlerRef.current) {
            downloadHandlerRef.current();
        }
    }, []);

    // Effect to add and remove the stable listener.
    useEffect(() => {
        const api = window.electronAPI;
        if (api && api.onDownloadPhotos && api.removeAllDownloadPhotosListeners) {
            // On mount, defensively remove any lingering listeners. This ensures that only
            // this active component instance reacts to the download command from the main menu.
            api.removeAllDownloadPhotosListeners();
            
            // Then, add the listener for this specific component instance.
            api.onDownloadPhotos(stableListener);
        }
        
        return () => {
            // On unmount, clean up the listener we added to prevent memory leaks.
            if (api && api.removeDownloadPhotosListener) {
                api.removeDownloadPhotosListener(stableListener);
            }
        };
    }, [stableListener]); // stableListener is memoized, so this effect runs once on mount/unmount.

    // Keyboard shortcut listeners
    useEffect(() => {
        const api = window.electronAPI;
        if (api?.onQuickSaveShortcut) {
            api.removeQuickSaveShortcutListener?.();
            api.onQuickSaveShortcut(() => { quickSaveRef.current?.(); });
        }
        if (api?.onSaveProjectShortcut) {
            api.removeSaveProjectShortcutListener?.();
            api.onSaveProjectShortcut(() => { saveProjectRef.current?.(); });
        }
        if (api?.onExportPdfShortcut) {
            api.removeExportPdfShortcutListener?.();
            api.onExportPdfShortcut(() => { savePdfRef.current?.(); });
        }
        return () => {
            api?.removeQuickSaveShortcutListener?.();
            api?.removeSaveProjectShortcutListener?.();
            api?.removeExportPdfShortcutListener?.();
        };
    }, []);

    // Project packaging — respond to Package Project… menu action
    useEffect(() => {
        const handlePackageRequest = () => {
            const photos = photosData
                .filter(p => p.imageUrl)
                .map((p, i) => ({
                    imageUrl: p.imageUrl!,
                    filename: `photo_${String(p.photoNumber ?? i + 1).padStart(3, '0')}.jpg`,
                    description: p.description ?? '',
                }));
            // Keep imageUrl so PackageProjectModal can map it to assetPath; strip only imageId
            const exportPhotos = photosData.map(({ imageId, ...rest }) => rest);
            window.dispatchEvent(new CustomEvent('xtec-project-data-response', {
                detail: {
                    projectData: { ...data, photosData: exportPhotos },
                    projectType: 'spdfr',
                    projectName: data.projectName || 'Untitled SaskPower DFR',
                    photos,
                },
            }));
        };
        window.addEventListener('xtec-request-project-data', handlePackageRequest);
        return () => window.removeEventListener('xtec-request-project-data', handlePackageRequest);
    }, [data, photosData]);

    useEffect(() => {
        const interval = setInterval(() => {
            if (isDirtyRef.current && autosaveEnabledRef.current) {
                quickSaveRef.current?.();
            }
        }, autosaveIntervalMs);
        return () => clearInterval(interval);
    }, [autosaveIntervalMs]);

    useEffect(() => () => { if (justSavedTimeoutRef.current) clearTimeout(justSavedTimeoutRef.current); }, []);

    useEffect(() => {
        if (!showMoreMenu) return;
        const handler = (e: MouseEvent) => {
            if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
                setShowMoreMenu(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showMoreMenu]);

    useEffect(() => {
        const name = data.projectName || '';
        const num = data.projectNumber || '';
        const prefix = [num, name].filter(Boolean).join(' – ');
        document.title = prefix ? `${prefix} | X-TEC` : 'X-TEC Digital Reporting';
        return () => { document.title = 'X-TEC Digital Reporting'; };
    }, [data.projectName, data.projectNumber]);

    useEffect(() => {
        return () => {
            photosDataRef.current.forEach(p => { if (p.imageUrl) revokeImageUrl(p.imageUrl); });
        };
    }, []);

    const handleOpenProject = async () => {
        // @ts-ignore
        if (window.electronAPI) {
            // @ts-ignore
            const fileContent = await window.electronAPI.loadProject('spdfr');
            if (fileContent) {
                await parseAndLoadProject(fileContent);
            }
        } else {
            fileInputRef.current?.click();
        }
    };
    
    const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const fileContent = await file.text();
        await parseAndLoadProject(fileContent);
        if (event.target) {
            event.target.value = '';
        }
    };

    const getPhotoErrors = (id: number): Set<keyof PhotoData> => {
        const photoErrors = new Set<keyof PhotoData>();
        errors.forEach(errorKey => {
            const prefix = `photo-${id}-`;
            if (errorKey.startsWith(prefix)) {
                photoErrors.add(errorKey.substring(prefix.length) as keyof PhotoData);
            }
        });
        return photoErrors;
    };

    return (
        <div
            className="bg-gray-50 dark:bg-[#161618] min-h-screen transition-colors duration-200 relative"
            onDragOver={handleFileDragOver}
            onDragLeave={handleFileDragLeave}
            onDrop={handleFileDrop}
        >
            {isDroppingFiles && (
                <div className="fixed inset-0 z-[999] bg-black/50 backdrop-blur-sm pointer-events-none flex items-center justify-center">
                    <div className="bg-white dark:bg-gray-900 border-2 border-[#007D8C] ring-8 ring-[#007D8C]/10 rounded-3xl px-16 py-12 flex flex-col items-center gap-5 shadow-2xl">
                        <div className="w-20 h-20 rounded-2xl bg-[#007D8C]/10 flex items-center justify-center">
                            <svg className="w-10 h-10 text-[#007D8C]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Drop photos here</p>
                            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">JPEG and PNG supported</p>
                        </div>
                    </div>
                </div>
            )}
            {pdfPreview && (
                <PdfPreviewModal
                    pdfBlob={pdfPreview.blob}
                    filename={pdfPreview.filename}
                    onClose={() => setPdfPreview(null)}
                />
            )}
            {enlargedImageUrl && (
                <ImageModal imageUrl={enlargedImageUrl} onClose={() => setEnlargedImageUrl(null)} />
            )}
            {showStatusModal && <ActionStatusModal message={statusMessage} />}
            <SpecialCharacterPalette />

            {/* Flex container: content + comments side by side, scroll together */}
            <div className="flex justify-center gap-2 lg:gap-4 p-2 sm:p-4 lg:p-6 xl:p-8">
                {/* Main content column - scales down on laptops to fit comments */}
                <div className="flex-1 min-w-0 max-w-[1400px]">
                {showMigrationNotice && (
                    <div className="flex items-start gap-3 bg-[#007D8C]/8 dark:bg-[#007D8C]/10 border border-[#007D8C]/25 p-3.5 mb-6 rounded-xl" role="alert">
                        <svg className="h-5 w-5 text-[#007D8C] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 dark:text-white">Project format updated</p>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Opened in an older format and automatically updated. Save the project to keep these changes.</p>
                        </div>
                        <button onClick={() => setShowMigrationNotice(false)} className="shrink-0 p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-[#007D8C]/10 transition-colors focus:outline-none focus:ring-2 focus:ring-[#007D8C]/40" aria-label="Dismiss">
                            <CloseIcon className="h-4 w-4" />
                        </button>
                    </div>
                )}
                <div className="sticky top-0 z-40 bg-gray-50/95 dark:bg-[#161618]/95 backdrop-blur-sm py-2.5 mb-4 border-b border-gray-200/60 dark:border-white/5">
                    <div className="flex flex-wrap justify-between items-center gap-2">
                        <button onClick={handleBack} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200">
                            <ArrowLeftIcon /> <span>Home</span>
                        </button>
                        <div className="flex flex-wrap justify-end gap-2">
                            <div className="flex items-center gap-1.5">
                                <span className="text-xs text-gray-500 dark:text-gray-400">Autosave</span>
                                <button
                                    onClick={() => {
                                        if (!autosaveEnabled && projectTimestampRef.current === null) {
                                            setFirstSaveHeader({ proponent: data.proponent, projectName: data.projectName, location: data.location, date: data.date, projectNumber: data.projectNumber });
                                            setShowFirstSaveModal(true);
                                        } else {
                                            setAutosaveEnabled(v => !v);
                                        }
                                    }}
                                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${autosaveEnabled ? 'bg-[#007D8C]' : 'bg-gray-300 dark:bg-gray-600'}`}
                                    title={autosaveEnabled ? 'Autosave on — click to disable' : 'Autosave off — click to enable'}
                                >
                                    <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${autosaveEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                                </button>
                                {(isSyncing || lastSyncedAt) && (
                                    <span className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500">
                                        {isSyncing ? (
                                            <svg className="w-3 h-3 animate-spin text-[#007D8C]" viewBox="0 0 24 24" fill="none">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                            </svg>
                                        ) : (
                                            <svg className="w-3 h-3 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                                            </svg>
                                        )}
                                        <span>{isSyncing ? 'Syncing…' : `Synced ${lastSyncedAt!.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}</span>
                                    </span>
                                )}
                            </div>
                            {/* Save — primary action, handles first-save dialog automatically */}
                            <button onClick={handleQuickSave} title={justSaved ? 'Saved' : 'Save (Ctrl+S)'}
                                className={`p-2.5 rounded-lg transition-all duration-200 ${justSaved?'bg-green-600 hover:bg-green-700 text-white':'bg-[#007D8C] hover:bg-[#006b7a] text-white'}`}>
                                {justSaved?<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>:<SaveIcon className="w-4 h-4" />}
                            </button>
                            <div className="relative" ref={moreMenuRef}>
                                <button onClick={() => setShowMoreMenu(v => !v)} title="File options"
                                    className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1c1c1e] hover:bg-gray-50 dark:hover:bg-[#2a2a2e] text-gray-700 dark:text-gray-200 font-semibold py-2 px-3 rounded-lg inline-flex items-center gap-1.5 transition duration-200">
                                    <FolderOpenIcon className="w-4 h-4" /> <span>File</span>
                                    <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${showMoreMenu ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></svg>
                                </button>
                                {showMoreMenu && (
                                    <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-[#007D8C]/20 rounded-xl shadow-xl py-1 min-w-[180px] overflow-hidden">
                                        <button onClick={() => { setShowMoreMenu(false); handleQuickSave(); }}
                                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-[#007D8C]/5 dark:hover:bg-[#007D8C]/10 flex items-center gap-2.5 transition-colors">
                                            <SaveIcon color="currentColor" className="w-4 h-4 shrink-0 text-gray-400" />
                                            Save
                                        </button>
                                        <button onClick={() => { setShowMoreMenu(false); handleSaveProject(); }}
                                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-[#007D8C]/5 dark:hover:bg-[#007D8C]/10 flex items-center gap-2.5 transition-colors">
                                            <SaveIcon color="currentColor" className="w-4 h-4 shrink-0 text-gray-400" />
                                            Save As…
                                        </button>
                                        <div className="my-1 border-t border-gray-100 dark:border-white/5" />
                                        <button onClick={() => { setShowMoreMenu(false); handleSavePdf(); }}
                                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-[#007D8C]/5 dark:hover:bg-[#007D8C]/10 flex items-center gap-2.5 transition-colors">
                                            <DownloadIcon color="currentColor" className="w-4 h-4 shrink-0 text-gray-400" />
                                            Export PDF
                                        </button>
                                        <div className="my-1 border-t border-gray-100 dark:border-white/5" />
                                        <button onClick={() => { setShowMoreMenu(false); handleOpenProject(); }}
                                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-[#007D8C]/5 dark:hover:bg-[#007D8C]/10 flex items-center gap-2.5 transition-colors">
                                            <FolderOpenIcon className="w-4 h-4 shrink-0 text-gray-400" />
                                            Open…
                                        </button>
                                    </div>
                                )}
                            </div>
                            <input type="file" ref={fileInputRef} onChange={handleFileSelected} style={{ display: 'none' }} accept=".spdfr" />
                            {/* @ts-ignore */}
                            {!window.electronAPI && (
                                <button onClick={handleDownloadPhotos} className="border border-[#007D8C] text-[#007D8C] hover:bg-[#007D8C]/10 dark:hover:bg-[#007D8C]/10 font-semibold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200">
                                    <FolderArrowDownIcon /> <span>Download Photos</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Zoom Controls */}
                <div className="flex items-center justify-end gap-1 mb-4">
                    <button onClick={handleZoomOut} className="p-1.5 rounded-md bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-400 transition focus:outline-none focus:ring-2 focus:ring-[#007D8C]/40" title="Zoom out">
                        <ZoomOutIcon className="h-4 w-4" />
                    </button>
                    <button onClick={handleZoomReset} className="px-2 py-1 text-xs font-medium rounded-md bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-400 transition min-w-[3rem] focus:outline-none focus:ring-2 focus:ring-[#007D8C]/40" title="Reset zoom">
                        {zoomLevel}%
                    </button>
                    <button onClick={handleZoomIn} className="p-1.5 rounded-md bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-400 transition focus:outline-none focus:ring-2 focus:ring-[#007D8C]/40" title="Zoom in">
                        <ZoomInIcon className="h-4 w-4" />
                    </button>
                </div>

                <div className="main-content space-y-8" style={{ overflow: 'visible', transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top left', width: `${10000 / zoomLevel}%` }}>
                    {/* Header Section */}
                    <div id="report-fields-section" className="xtec-report-card p-6 transition-colors duration-200" style={{ overflow: 'visible' }}>
                        <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] md:items-center pb-3 gap-4">
                            <div className="flex justify-center md:justify-start">
                                <SafeImage fileName="xterra-logo.png" alt="X-TERRA Logo" className="h-14 w-auto dark:hidden" />
                                <SafeImage fileName="xterra-white.png" alt="X-TERRA Logo" className="h-14 w-auto hidden dark:block" />
                            </div>
                            <h1 className="font-extrabold text-[#007D8C] tracking-wider text-center whitespace-nowrap text-4xl">
                                DAILY FIELD REPORT
                            </h1>
                            <div></div>
                        </div>
                        <div className="xtec-divider mb-3"></div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 pt-3 pb-2">
                             {/* Col 1 */}
                            <div className="flex flex-col gap-y-2">
                                <EditableField label="PROPONENT" value={data.proponent} onChange={(v) => handleChange('proponent', v)} isInvalid={errors.has('proponent')} />
                                <EditableField label="PROJECT" value={data.projectName} onChange={(v) => handleChange('projectName', v)} isInvalid={errors.has('projectName')} />
                                <EditableField label="LOCATION" value={data.location} onChange={(v) => handleChange('location', v)} isTextArea isInvalid={errors.has('location')} />
                                <EditableField label="ENV FILE NUMBER" value={data.envFileNumber} onChange={(v) => handleChange('envFileNumber', v)} isInvalid={errors.has('envFileNumber')} />
                            </div>
                            {/* Col 2 */}
                            <div className="flex flex-col gap-y-2">
                                <EditableField label="DATE" value={data.date} onChange={(v) => handleChange('date', v)} placeholder="Month Day, Year" isInvalid={errors.has('date')} />
                                <EditableField label="X-TERRA PROJECT #" value={data.projectNumber} onChange={(v) => handleChange('projectNumber', v)} isInvalid={errors.has('projectNumber')} />
                                <EditableField label="MONITOR" value={data.environmentalMonitor} onChange={(v) => handleChange('environmentalMonitor', v)} isInvalid={errors.has('environmentalMonitor')} />
                                <EditableField label="VENDOR & FOREMAN" value={data.vendorAndForeman} onChange={(v) => handleChange('vendorAndForeman', v)} isInvalid={errors.has('vendorAndForeman')} />
                            </div>
                        </div>
                        <div className="xtec-divider mt-2"></div>
                    </div>

                    {/* Project Activities */}
                    <Section title="Project Activities">
                         <div className="flex items-center justify-between mb-1">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Project Activities (detailed description with timestamps)</label>
                             <button onClick={() => toggleComment('generalActivity')} title="Toggle comment" className={`p-1 rounded-full ${openComments.has('generalActivity') ? 'bg-yellow-200 text-yellow-800' : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'}`}>
                                <ChatBubbleLeftIcon className="h-5 w-5 text-black dark:text-yellow-400" />
                            </button>
                        </div>
                         {openComments.has('generalActivity') && (
                            <textarea value={data.comments?.generalActivity || ''} onChange={(e) => handleCommentChange('generalActivity', e.target.value)} placeholder="Add a comment for editing purposes..." rows={2} className="block w-full p-2 border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-700/50 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition mb-2" spellCheck={true} />
                        )}
                        <BulletPointEditor label="" fieldId="generalActivity" value={data.generalActivity} highlights={data.highlights?.generalActivity} inlineComments={data.inlineComments?.generalActivity} onChange={(v) => handleChange('generalActivity', v)} onHighlightsChange={(h) => handleHighlightsChange('generalActivity', h)} onInlineCommentsChange={(c) => handleInlineCommentsChange('generalActivity', c)} onAnchorPositionsChange={(a) => handleAnchorPositionsChange('generalActivity', a)} hoveredCommentId={hoveredCommentId} rows={15} placeholder={saskPowerPlaceholders.generalActivity} isInvalid={errors.has('generalActivity')} />
                    </Section>

                    {/* Equipment & Conditions */}
                    <Section title="Equipment and Conditions">
                        <div className="space-y-4">
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">X-Terra Equipment Onsite</label>
                                     <button onClick={() => toggleComment('equipmentOnsite')} title="Toggle comment" className={`p-1 rounded-full ${openComments.has('equipmentOnsite') ? 'bg-yellow-200 text-yellow-800' : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'}`}>
                                        <ChatBubbleLeftIcon className="h-5 w-5 text-black dark:text-yellow-400" />
                                    </button>
                                </div>
                                {openComments.has('equipmentOnsite') && (
                                    <textarea value={data.comments?.equipmentOnsite || ''} onChange={(e) => handleCommentChange('equipmentOnsite', e.target.value)} placeholder="Add a comment..." rows={2} className="block w-full p-2 border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-700/50 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition mb-2" spellCheck={true} />
                                )}
                                <BulletPointEditor label="" fieldId="equipmentOnsite" value={data.equipmentOnsite} highlights={data.highlights?.equipmentOnsite} inlineComments={data.inlineComments?.equipmentOnsite} onChange={(v) => handleChange('equipmentOnsite', v)} onHighlightsChange={(h) => handleHighlightsChange('equipmentOnsite', h)} onInlineCommentsChange={(c) => handleInlineCommentsChange('equipmentOnsite', c)} onAnchorPositionsChange={(a) => handleAnchorPositionsChange('equipmentOnsite', a)} hoveredCommentId={hoveredCommentId} rows={3} placeholder={saskPowerPlaceholders.equipmentOnsite} isInvalid={errors.has('equipmentOnsite')} />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Weather and Ground Conditions</label>
                                     <button onClick={() => toggleComment('weatherAndGroundConditions')} title="Toggle comment" className={`p-1 rounded-full ${openComments.has('weatherAndGroundConditions') ? 'bg-yellow-200 text-yellow-800' : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'}`}>
                                        <ChatBubbleLeftIcon className="h-5 w-5 text-black dark:text-yellow-400" />
                                    </button>
                                </div>
                                {openComments.has('weatherAndGroundConditions') && (
                                    <textarea value={data.comments?.weatherAndGroundConditions || ''} onChange={(e) => handleCommentChange('weatherAndGroundConditions', e.target.value)} placeholder="Add a comment..." rows={2} className="block w-full p-2 border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-700/50 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition mb-2" spellCheck={true} />
                                )}
                                <BulletPointEditor label="" fieldId="weatherAndGroundConditions" value={data.weatherAndGroundConditions} highlights={data.highlights?.weatherAndGroundConditions} inlineComments={data.inlineComments?.weatherAndGroundConditions} onChange={(v) => handleChange('weatherAndGroundConditions', v)} onHighlightsChange={(h) => handleHighlightsChange('weatherAndGroundConditions', h)} onInlineCommentsChange={(c) => handleInlineCommentsChange('weatherAndGroundConditions', c)} onAnchorPositionsChange={(a) => handleAnchorPositionsChange('weatherAndGroundConditions', a)} hoveredCommentId={hoveredCommentId} rows={3} placeholder={saskPowerPlaceholders.weatherAndGroundConditions} isInvalid={errors.has('weatherAndGroundConditions')} />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Environmental Protection Measures and Mitigation</label>
                                     <button onClick={() => toggleComment('environmentalProtection')} title="Toggle comment" className={`p-1 rounded-full ${openComments.has('environmentalProtection') ? 'bg-yellow-200 text-yellow-800' : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'}`}>
                                        <ChatBubbleLeftIcon className="h-5 w-5 text-black dark:text-yellow-400" />
                                    </button>
                                </div>
                                {openComments.has('environmentalProtection') && (
                                    <textarea value={data.comments?.environmentalProtection || ''} onChange={(e) => handleCommentChange('environmentalProtection', e.target.value)} placeholder="Add a comment..." rows={2} className="block w-full p-2 border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-700/50 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition mb-2" spellCheck={true} />
                                )}
                                <BulletPointEditor label="" fieldId="environmentalProtection" value={data.environmentalProtection} highlights={data.highlights?.environmentalProtection} inlineComments={data.inlineComments?.environmentalProtection} onChange={(v) => handleChange('environmentalProtection', v)} onHighlightsChange={(h) => handleHighlightsChange('environmentalProtection', h)} onInlineCommentsChange={(c) => handleInlineCommentsChange('environmentalProtection', c)} onAnchorPositionsChange={(a) => handleAnchorPositionsChange('environmentalProtection', a)} hoveredCommentId={hoveredCommentId} rows={3} placeholder={saskPowerPlaceholders.environmentalProtection} isInvalid={errors.has('environmentalProtection')} />
                            </div>
                            
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Wildlife Observations</label>
                                     <button onClick={() => toggleComment('wildlifeObservations')} title="Toggle comment" className={`p-1 rounded-full ${openComments.has('wildlifeObservations') ? 'bg-yellow-200 text-yellow-800' : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'}`}>
                                        <ChatBubbleLeftIcon className="h-5 w-5 text-black dark:text-yellow-400" />
                                    </button>
                                </div>
                                {openComments.has('wildlifeObservations') && (
                                    <textarea value={data.comments?.wildlifeObservations || ''} onChange={(e) => handleCommentChange('wildlifeObservations', e.target.value)} placeholder="Add a comment..." rows={2} className="block w-full p-2 border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-700/50 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition mb-2" spellCheck={true} />
                                )}
                                <BulletPointEditor label="" fieldId="wildlifeObservations" value={data.wildlifeObservations} highlights={data.highlights?.wildlifeObservations} inlineComments={data.inlineComments?.wildlifeObservations} onChange={(v) => handleChange('wildlifeObservations', v)} onHighlightsChange={(h) => handleHighlightsChange('wildlifeObservations', h)} onInlineCommentsChange={(c) => handleInlineCommentsChange('wildlifeObservations', c)} onAnchorPositionsChange={(a) => handleAnchorPositionsChange('wildlifeObservations', a)} hoveredCommentId={hoveredCommentId} rows={3} placeholder={saskPowerPlaceholders.wildlifeObservations} isInvalid={errors.has('wildlifeObservations')} />
                            </div>

                             <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Future Monitoring Requirements</label>
                                     <button onClick={() => toggleComment('futureMonitoring')} title="Toggle comment" className={`p-1 rounded-full ${openComments.has('futureMonitoring') ? 'bg-yellow-200 text-yellow-800' : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'}`}>
                                        <ChatBubbleLeftIcon className="h-5 w-5 text-black dark:text-yellow-400" />
                                    </button>
                                </div>
                                {openComments.has('futureMonitoring') && (
                                    <textarea value={data.comments?.futureMonitoring || ''} onChange={(e) => handleCommentChange('futureMonitoring', e.target.value)} placeholder="Add a comment..." rows={2} className="block w-full p-2 border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-700/50 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition mb-2" spellCheck={true} />
                                )}
                                <BulletPointEditor label="" fieldId="futureMonitoring" value={data.futureMonitoring} highlights={data.highlights?.futureMonitoring} inlineComments={data.inlineComments?.futureMonitoring} onChange={(v) => handleChange('futureMonitoring', v)} onHighlightsChange={(h) => handleHighlightsChange('futureMonitoring', h)} onInlineCommentsChange={(c) => handleInlineCommentsChange('futureMonitoring', c)} onAnchorPositionsChange={(a) => handleAnchorPositionsChange('futureMonitoring', a)} hoveredCommentId={hoveredCommentId} rows={3} placeholder={saskPowerPlaceholders.futureMonitoring} isInvalid={errors.has('futureMonitoring')} />
                            </div>
                        </div>
                    </Section>

                    {/* Checklists & Hours */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <Section title="Daily Checklists">
                             <div className="space-y-0">
                                <ChecklistRow label="Completed/Reviewed X-Terra Tailgate" value={data.completedTailgate} onChange={(v) => handleChange('completedTailgate', v)} isInvalid={errors.has('completedTailgate')} />
                                <ChecklistRow label="Reviewed/Signed Crew Tailgate" value={data.reviewedTailgate} onChange={(v) => handleChange('reviewedTailgate', v)} isInvalid={errors.has('reviewedTailgate')} />
                                <ChecklistRow label="Reviewed Permit(s) with Crew(s)" value={data.reviewedPermits} onChange={(v) => handleChange('reviewedPermits', v)} isInvalid={errors.has('reviewedPermits')} />
                            </div>
                        </Section>
                        
                         <Section title="Total Hours">
                            <EditableField label="Total Hours Worked" value={data.totalHoursWorked} onChange={(v) => handleChange('totalHoursWorked', v)} placeholder="e.g., 10.5" isInvalid={errors.has('totalHoursWorked')} />
                        </Section>
                    </div>

                    <div className="border-t border-gray-200 dark:border-white/10 my-10" />

                    <h2 className="text-3xl font-bold text-gray-700 dark:text-white text-center">Photographic Log</h2>
                    
                    <DndContext collisionDetection={closestCenter} onDragEnd={handlePhotoDragEnd}>
                      <SortableContext items={photosData.map(p => p.id)} strategy={verticalListSortingStrategy}>
                        {photosData.map((photo, index) => (
                           <div key={photo.id} id={`photo-entry-${photo.id}`}>
                                <PhotoEntry
                                    data={photo}
                                    onDataChange={handlePhotoDataChange}
                                    onImageChange={handleImageChange}
                                    onRemove={removePhoto}
                                    onImageClick={setEnlargedImageUrl}
                                    errors={getPhotoErrors(photo.id)}
                                    showDirectionField={!photo.isMap}
                                    headerDate={data.date}
                                    headerLocation={data.location}
                                    inlineComments={photo.inlineComments}
                                    onInlineCommentsChange={handlePhotoCommentsChange}
                                    highlights={photo.highlights}
                                    onHighlightsChange={handlePhotoHighlightsChange}
                                    onAnchorPositionsChange={handlePhotoAnchorPositionsChange}
                                    hoveredCommentId={hoveredCommentId}
                                />
                                {index < photosData.length - 1 && (
                                     <div className="relative my-6 flex items-center justify-center">
                                        <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                            <div className="w-full border-t border-gray-200 dark:border-white/10"></div>
                                        </div>
                                        <div className="relative">
                                            <button
                                                onClick={() => addPhoto(index)}
                                                className="bg-white hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 text-[#007D8C] font-bold py-2 px-4 rounded-full border border-gray-300 dark:border-gray-600 inline-flex items-center gap-2 transition duration-200 shadow-sm"
                                            >
                                                <PlusIcon />
                                                <span>Add Photo Here</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                      </SortableContext>
                    </DndContext>

                    <div className="mt-8 flex flex-col items-center gap-3">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => addPhoto()}
                                className="bg-[#007D8C] hover:bg-[#006b7a] text-white font-bold py-3 px-6 rounded-lg shadow-md inline-flex items-center gap-2 transition duration-200 text-lg"
                            >
                                <PlusIcon />
                                <span>Add Photo</span>
                            </button>
                            <button
                                onClick={() => batchInputRef.current?.click()}
                                disabled={!!batchProgress}
                                className="bg-white hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 text-[#007D8C] font-bold py-3 px-6 rounded-lg shadow-md border-2 border-[#007D8C] inline-flex items-center gap-2 transition duration-200 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <FolderArrowDownIcon />
                                <span>Import Photos</span>
                            </button>
                            <input
                                type="file"
                                ref={batchInputRef}
                                multiple
                                accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                                style={{ display: 'none' }}
                                onChange={e => { if (e.target.files?.length) { handleBatchImport(e.target.files); e.target.value = ''; } }}
                            />
                        </div>
                        {batchProgress && (
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                <svg className="animate-spin h-4 w-4 text-[#007D8C]" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                                <span>Processing {batchProgress.current} of {batchProgress.total}…</span>
                            </div>
                        )}
                    </div>
                </div>
                {photosData.length > 0 && <div className="border-t border-gray-200 dark:border-white/10 my-8" />}
                <footer className="text-center text-gray-500 dark:text-gray-400 text-sm py-4">
                    X-TES Digital Reporting v1.1.6
                </footer>
                </div>

                {/* Comments pane - hidden on small screens, visible on laptops+ */}
                {hasAnyInlineComments && (
                    <div className="hidden lg:block flex-shrink-0 sticky top-4 self-start">
                        <CommentsRail
                            comments={allComments}
                            anchors={commentAnchors}
                            isCollapsed={commentsCollapsed}
                            onToggleCollapsed={() => setCommentsCollapsed(!commentsCollapsed)}
                            onDeleteComment={handleDeleteComment}
                            onResolveComment={handleResolveComment}
                            onUpdateComment={handleUpdateComment}
                            onAddReply={handleAddReply}
                            onDeleteReply={handleDeleteReply}
                            onHoverComment={setHoveredCommentId}
                            onFocusComment={handleFocusComment}
                            contentShiftAmount={160}
                            railWidth={300}
                        />
                    </div>
                )}
            </div>

            {/* Modals */}
             {showUnsupportedFileModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 transition-opacity duration-300">
                    <div className="bg-white dark:bg-[#1c1c1e] p-6 rounded-xl shadow-2xl text-center relative max-w-md">
                        <button onClick={() => setShowUnsupportedFileModal(false)} className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                            <CloseIcon className="h-6 w-6" />
                        </button>
                        <SafeImage fileName="loading-error.gif" alt="Unsupported file type" className="mx-auto mb-4 w-40 h-40" />
                        <h3 className="text-2xl font-bold mb-2 text-gray-800 dark:text-white">Unsupported File Type</h3>
                        <p className="text-gray-600 dark:text-gray-400">Please upload a supported image file (JPG, PNG).</p>
                    </div>
                </div>
            )}
            {showValidationErrorModal && (() => {
                const reportLabels: Record<string, string> = {
                    date: 'Date', location: 'Location', projectName: 'Project Name',
                    vendorAndForeman: 'Vendor & Foreman', projectNumber: 'Project Number',
                    environmentalMonitor: 'Environmental Monitor', envFileNumber: 'Env. File Number',
                    generalActivity: 'General Activity', totalHoursWorked: 'Total Hours Worked',
                    equipmentOnsite: 'Equipment Onsite', weatherAndGroundConditions: 'Weather & Ground Conditions',
                    environmentalProtection: 'Environmental Protection', wildlifeObservations: 'Wildlife Observations',
                    futureMonitoring: 'Future Monitoring', completedTailgate: 'Completed Tailgate',
                    reviewedTailgate: 'Reviewed Tailgate', reviewedPermits: 'Reviewed Permits',
                };
                const photoFieldLabels: Record<string, string> = {
                    date: 'Date', location: 'Location', description: 'Description',
                    imageUrl: 'Image', direction: 'Direction',
                };
                const missingReport = Array.from(errors).filter(k => !k.startsWith('photo-')).map(k => reportLabels[k] || k);
                const photoErrors: Record<string, string[]> = {};
                Array.from(errors).filter(k => k.startsWith('photo-')).forEach(k => {
                    const match = k.match(/^photo-(\d+)-(.+)$/);
                    if (match) {
                        const photo = photosData.find(p => p.id === Number(match[1]));
                        const label = photo ? `Photo ${photo.photoNumber}` : 'Photo';
                        if (!photoErrors[label]) photoErrors[label] = [];
                        photoErrors[label].push(photoFieldLabels[match[2]] || match[2]);
                    }
                });
                const badgeClass = "inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full text-xs font-medium border border-red-200 dark:border-red-800";
                return (
                    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
                        <div role="alert" className="bg-white dark:bg-[#1c1c1e] rounded-xl shadow-2xl relative max-w-md w-full mx-4 overflow-hidden">
                            <div className="flex items-center gap-4 p-5 border-b border-gray-100 dark:border-white/5">
                                <SafeImage fileName="loading-error.gif" alt="Missing info" className="w-14 h-14 flex-shrink-0 rounded-lg" />
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-lg font-bold text-gray-800 dark:text-white">Missing Information</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Fields highlighted in red need to be filled in.</p>
                                </div>
                                <button onClick={() => setShowValidationErrorModal(false)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0">
                                    <CloseIcon className="h-5 w-5" />
                                </button>
                            </div>
                            <div className="p-5 space-y-4 max-h-72 overflow-y-auto">
                                {missingReport.length > 0 && (
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Report</p>
                                        <div className="flex flex-wrap gap-2">
                                            {missingReport.map(label => (
                                                <span key={label} className={badgeClass}>
                                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                                                    {label}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {Object.entries(photoErrors).map(([photoLabel, fields]) => (
                                    <div key={photoLabel}>
                                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">{photoLabel}</p>
                                        <div className="flex flex-wrap gap-2">
                                            {fields.map(f => (
                                                <span key={f} className={badgeClass}>
                                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                                                    {f}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="px-5 pb-5 pt-1">
                                <button onClick={() => setShowValidationErrorModal(false)} className="w-full bg-[#007D8C] hover:bg-[#006270] text-white font-semibold py-2.5 px-4 rounded-lg transition-colors text-sm">
                                    OK
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
            {showNoInternetModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
                     <div className="bg-white dark:bg-[#1c1c1e] p-6 rounded-xl shadow-2xl text-center relative max-w-md">
                        <button onClick={() => setShowNoInternetModal(false)} className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"><CloseIcon className="h-6 w-6" /></button>
                        <h3 className="text-2xl font-bold mb-2 text-gray-800 dark:text-white">No Internet Connection</h3>
                        <p className="text-gray-600 dark:text-gray-400">Internet is required for PDF generation.</p>
                    </div>
                </div>
            )}

            {showFirstSaveModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[200]">
                    <div className="bg-white dark:bg-[#1c1c1e] p-6 rounded-xl shadow-2xl relative max-w-lg w-full border border-gray-200 dark:border-[#007D8C]/20">
                        <h3 className="text-lg font-bold mb-1 text-gray-800 dark:text-white">Save Project</h3>
                        <p className="text-gray-500 dark:text-gray-400 text-xs mb-4">Confirm project details before saving. Autosave will activate after this.</p>
                        <div className="grid grid-cols-2 gap-3 mb-5">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Proponent</label>
                                <input type="text" value={firstSaveHeader.proponent} onChange={e => setFirstSaveHeader(h => ({...h, proponent: e.target.value}))} className="w-full border border-gray-200 dark:border-white/10 rounded-lg px-2 py-1.5 text-sm text-gray-800 dark:text-white bg-gray-50 dark:bg-transparent focus:outline-none focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C]" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Project #</label>
                                <input type="text" value={firstSaveHeader.projectNumber} onChange={e => setFirstSaveHeader(h => ({...h, projectNumber: e.target.value}))} className="w-full border border-gray-200 dark:border-white/10 rounded-lg px-2 py-1.5 text-sm text-gray-800 dark:text-white bg-gray-50 dark:bg-transparent focus:outline-none focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C]" />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Project Name</label>
                                <input type="text" value={firstSaveHeader.projectName} onChange={e => setFirstSaveHeader(h => ({...h, projectName: e.target.value}))} className="w-full border border-gray-200 dark:border-white/10 rounded-lg px-2 py-1.5 text-sm text-gray-800 dark:text-white bg-gray-50 dark:bg-transparent focus:outline-none focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C]" />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Location</label>
                                <input type="text" value={firstSaveHeader.location} onChange={e => setFirstSaveHeader(h => ({...h, location: e.target.value}))} className="w-full border border-gray-200 dark:border-white/10 rounded-lg px-2 py-1.5 text-sm text-gray-800 dark:text-white bg-gray-50 dark:bg-transparent focus:outline-none focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C]" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Date</label>
                                <input type="text" placeholder="e.g. October 1, 2025" value={firstSaveHeader.date} onChange={e => setFirstSaveHeader(h => ({...h, date: e.target.value}))} className="w-full border border-gray-200 dark:border-white/10 rounded-lg px-2 py-1.5 text-sm text-gray-800 dark:text-white bg-gray-50 dark:bg-transparent focus:outline-none focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C]" />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setShowFirstSaveModal(false)} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white text-sm font-semibold rounded-lg transition">Cancel</button>
                            <button onClick={handleConfirmFirstSave} disabled={!firstSaveHeader.projectName.trim()} className="px-4 py-2 bg-[#007D8C] hover:bg-[#006b7a] disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition">Save</button>
                        </div>
                    </div>
                </div>
            )}

            {showUnsavedModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[200]">
                    <div className="bg-white dark:bg-[#1c1c1e] p-6 rounded-xl shadow-2xl text-center relative max-w-md">
                        <h3 className="text-base font-semibold mb-2 text-gray-800 dark:text-white">Unsaved Changes</h3>
                        <p className="text-gray-600 dark:text-gray-400 mb-5">
                            You have unsaved changes. Are you sure you want to leave? Your changes will be lost.
                        </p>
                        <div className="flex justify-center gap-3">
                            <button
                                onClick={() => {
                                    setShowUnsavedModal(false);
                                    if (pendingCloseRef.current) {
                                        pendingCloseRef.current = false;
                                        // @ts-ignore
                                        window.electronAPI?.cancelClose();
                                    }
                                }}
                                className="px-5 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white font-semibold rounded-lg transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    setShowUnsavedModal(false);
                                    if (pendingCloseRef.current) {
                                        // @ts-ignore
                                        window.electronAPI?.confirmClose();
                                    } else {
                                        (onBackDirect ?? onBack)();
                                    }
                                }}
                                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition"
                            >
                                Leave Without Saving
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DfrSaskpower;