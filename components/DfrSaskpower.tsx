import React, { useState, ReactElement, useEffect, useRef, useCallback } from 'react';
import type { DfrSaskpowerData, ChecklistOption, PhotoData, LocationActivity, ActivityBlock } from '../types';
import { DownloadIcon, SaveIcon, FolderOpenIcon, ArrowLeftIcon, PlusIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon, CloseIcon, FolderArrowDownIcon, ChatBubbleLeftIcon } from './icons';
import { AppType } from '../App';
import PhotoEntry from './PhotoEntry';
import { storeImage, retrieveImage, deleteImage, storeProject, deleteProject, retrieveProject } from './db';
import { SpecialCharacterPalette } from './SpecialCharacterPalette';
import BulletPointEditor from './BulletPointEditor';
import ImageModal from './ImageModal';
import ActionStatusModal from './ActionStatusModal';

// @ts-ignore
const { jsPDF } = window.jspdf;
declare const JSZip: any;

// --- Recent Projects Utility ---
const RECENT_PROJECTS_KEY = 'xtec_recent_projects';

interface RecentProjectMetadata {
    type: AppType;
    name: string;
    projectNumber: string;
    timestamp: number;
}

const getRecentProjects = (): RecentProjectMetadata[] => {
    try {
        const projects = localStorage.getItem(RECENT_PROJECTS_KEY);
        return projects ? JSON.parse(projects) : [];
    } catch (e) {
        console.error("Failed to parse recent projects from localStorage", e);
        return [];
    }
};

const addRecentProject = async (projectData: any, projectInfo: { type: AppType; name: string; projectNumber: string; }) => {
    const timestamp = Date.now();
    
    try {
        await storeProject(timestamp, projectData);
    } catch (e) {
        console.error("Failed to save project to IndexedDB:", e);
        alert("Could not save the project to the local database. Your browser's storage might be full or corrupted.");
        return;
    }
    
    const recentProjects = getRecentProjects();
    const identifier = `${projectInfo.type}-${projectInfo.name}-${projectInfo.projectNumber}`;

    const existingProject = recentProjects.find(p => `${p.type}-${p.name}-${p.projectNumber}` === identifier);
    const filteredProjects = recentProjects.filter(p => `${p.type}-${p.name}-${p.projectNumber}` !== identifier);

    if (existingProject) {
        try {
            const oldProjectData = await retrieveProject(existingProject.timestamp);
            if (oldProjectData?.photosData) {
                for (const photo of oldProjectData.photosData) {
                    if (photo.imageId) await deleteImage(photo.imageId);
                }
            }
            await deleteProject(existingProject.timestamp);
        } catch (e) {
            console.error(`Failed to clean up old project version (${existingProject.timestamp}):`, e);
        }
    }
    
    const newProjectMetadata: RecentProjectMetadata = { ...projectInfo, timestamp };
    let updatedProjects = [newProjectMetadata, ...filteredProjects];
    
    const MAX_RECENT_PROJECTS_IN_LIST = 50;
    if (updatedProjects.length > MAX_RECENT_PROJECTS_IN_LIST) {
        const projectsToDelete = updatedProjects.splice(MAX_RECENT_PROJECTS_IN_LIST);
        for (const proj of projectsToDelete) {
             try {
                const projectDataToDelete = await retrieveProject(proj.timestamp);
                if (projectDataToDelete?.photosData) {
                    for (const photo of projectDataToDelete.photosData) {
                        if (photo.imageId) await deleteImage(photo.imageId);
                    }
                }
                await deleteProject(proj.timestamp);
            } catch (e) {
                console.error(`Failed to cleanup old project from list (${proj.timestamp}):`, e);
            }
        }
    }

    try {
        localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updatedProjects));
    } catch (e) {
        console.error("Failed to save recent projects to localStorage:", e);
        alert("Could not update recent projects list. Your browser's local storage may be full.");
    }
};

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
    } catch (e) { return dateString; }
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
            resolve(canvas.toDataURL('image/jpeg'));
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


const PdfPreviewModal: React.FC<{ url: string; filename: string; onClose: () => void; }> = ({ url, filename, onClose }) => {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'hidden';

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'auto';
            if (url && url.startsWith('blob:')) {
                URL.revokeObjectURL(url);
            }
        };
    }, [onClose, url]);

    const handleDownload = () => {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex flex-col items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
            <div className="bg-white rounded-lg shadow-2xl w-full h-full flex flex-col">
                <div className="flex justify-between items-center p-4 border-b bg-gray-50">
                    <h3 className="text-xl font-bold text-gray-800">PDF Preview</h3>
                    <div className="flex items-center gap-4">
                        <button onClick={handleDownload} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200">
                            <DownloadIcon />
                            <span>Download PDF</span>
                        </button>
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-800 transition-colors" aria-label="Close preview">
                            <CloseIcon className="h-8 w-8" />
                        </button>
                    </div>
                </div>
                <div className="flex-grow bg-gray-200">
                    <object data={url} type="application/pdf" className="w-full h-full">
                        <div className="flex flex-col items-center justify-center h-full bg-gray-100 p-8 text-center text-gray-700">
                            <p className="mb-4 text-lg font-semibold">It appears your browser cannot preview PDFs directly.</p>
                            <p className="mb-6">You can download the file to view it instead.</p>
                            <a
                                href={url}
                                download={filename}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200"
                            >
                                <DownloadIcon />
                                <span>Download PDF</span>
                            </a>
                        </div>
                    </object>
                </div>
            </div>
        </div>
    );
};


// --- UI Components ---
const Section: React.FC<{ title: string; children: React.ReactNode; }> = ({ title, children }) => (
    <div className="bg-white p-6 shadow-md rounded-lg">
        <h2 className="text-xl font-bold text-gray-800 border-b-2 border-gray-200 pb-2 mb-4">{title}</h2>
        <div className="space-y-4">{children}</div>
    </div>
);

const EditableField: React.FC<{ label: string; value: string; onChange: (value: string) => void; type?: string; isTextArea?: boolean; rows?: number; placeholder?: string; isInvalid?: boolean; }> = ({ label, value, onChange, type = 'text', isTextArea = false, rows = 1, placeholder = '', isInvalid = false }) => {
    const commonClasses = `block w-full p-2 border rounded-md shadow-sm focus:ring-2 focus:ring-[#007D8C] focus:border-[#007D8C] transition ${isInvalid ? 'border-red-500' : 'border-gray-300'}`;
    const elementRef = React.useRef<HTMLInputElement & HTMLTextAreaElement>(null);

    return (
        <div>
            {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
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

const ChecklistRow: React.FC<{ label: string; value: ChecklistOption; onChange: (value: ChecklistOption) => void; }> = ({ label, value, onChange }) => (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-2 border-b border-gray-200 last:border-b-0">
        <span className="text-gray-800 font-medium mb-2 sm:mb-0">{label}</span>
        <div className="flex items-center space-x-6">
            {(['Yes', 'No', 'NA'] as ChecklistOption[]).map(option => (
                <label key={option} className="flex items-center space-x-2 cursor-pointer text-gray-600">
                    <input
                        type="radio"
                        name={label}
                        value={option}
                        checked={value === option}
                        onChange={() => onChange(option)}
                        className="h-5 w-5 text-[#007D8C] border-gray-300 focus:ring-[#006b7a]"
                    />
                    <span>{option}</span>
                </label>
            ))}
        </div>
    </div>
);

const activityPlaceholder = `08:30 - Leave Estevan to project area.
10:00 - Arrive near structure 285 on B1K. Complete X-Terra hazard assessment. Contact Davey crew and assess access options to get to structure 285.
10:30 - Meet Davey crew and review permits and hazard assessments for Davey and X-Terra. Permit outlines 30m wetland buffer for all herbicide activities (including basal bark).
10:45 - Finish spraying structure #285. Travel to structure #19.
12:30 - Arrive at Structure #19 is located in same quarter section as EM sites 17-18, but structure #19 itself is not in an AHPP area and does not require an EM (confirmed this in person). Crew completed structure #19. Travel to structures 10 and 9.
1:30 - Arrive at structures 10 and 9. Both are EM structures - crews completed herbicide application.
2:00 - Finish structures 10 and 9. All EM sites completed on B1K. Head back to Estevan.
2:30 - Arrive in Estevan. Complete DFR.`;

// --- Main Component ---
interface DfrSaskpowerProps {
    onBack: () => void;
    initialData?: any;
}

const DfrSaskpower = ({ onBack, initialData }: DfrSaskpowerProps): ReactElement => {
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
        completedTailgate: 'Yes',
        reviewedTailgate: 'Yes',
        reviewedPermits: 'Yes',
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
    const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string } | null>(null);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [openComments, setOpenComments] = useState<Set<string>>(new Set());
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isDownloadingRef = useRef(false);

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
            setPhotosData(hydratedPhotos);
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
            await addRecentProject(stateForRecent, { type: 'dfrSaskpower', name: projectName, projectNumber: finalData.projectNumber });
        } catch (err) {
            alert('Error parsing project file. Ensure it is a valid project file.');
            console.error(err);
        }
    }

    useEffect(() => {
        const loadInitialData = async () => {
            if (initialData) {
                await processLoadedData(initialData);
            }
        };
        loadInitialData();
    }, [initialData]);

    const handleChange = (field: keyof Omit<DfrSaskpowerData, 'comments'>, value: string | ChecklistOption) => {
        setData(prev => ({ ...prev, [field]: value }));
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
    };

    // --- Photo Handlers ---
    const handlePhotoDataChange = (id: number, field: keyof Omit<PhotoData, 'id' | 'imageUrl' | 'imageId'>, value: string) => {
        setPhotosData(prev => prev.map(photo => photo.id === id ? { ...photo, [field]: value } : photo));
    };
    
    const handleImageChange = (id: number, file: File) => {
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
             });
        };
        reader.readAsDataURL(file);
    };

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
    };

    const removePhoto = (id: number) => {
        setPhotosData(prev => {
            const photoToRemove = prev.find(p => p.id === id);
            if (photoToRemove && photoToRemove.imageId) {
                deleteImage(photoToRemove.imageId).catch(err => console.error("Failed to delete image from DB", err));
            }
            return renumberPhotos(prev.filter(photo => photo.id !== id));
        });
    };

    const movePhoto = (id: number, direction: 'up' | 'down') => {
        const index = photosData.findIndex(p => p.id === id);
        if (index === -1) return;

        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= photosData.length) return;

        const newPhotos = [...photosData];
        [newPhotos[index], newPhotos[newIndex]] = [newPhotos[newIndex], newPhotos[index]];
        
        setPhotosData(renumberPhotos(newPhotos));
    };

    const prepareStateForRecentProjectStorage = async (dataToStore: DfrSaskpowerData) => {
        const photosForStorage = await Promise.all(
            photosData.map(async (photo) => {
                if (photo.imageUrl) {
                    const imageId = photo.imageId || `${dataToStore.projectNumber || 'proj'}-${photo.id}-${Date.now()}`;
                    await storeImage(imageId, photo.imageUrl);
                    const { imageUrl, ...rest } = photo;
                    return { ...rest, imageId };
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
            'wildlifeObservations', 'futureMonitoring'
        ];

        requiredFields.forEach(field => {
            const value = data[field];
            if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) {
                newErrors.add(field);
            }
        });

        photosData.forEach(photo => {
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


    const handleSavePdf = async () => {
        if (!navigator.onLine) {
            setShowNoInternetModal(true);
            return;
        }
        if (!validateForm()) return;

        const stateForSaving = await prepareStateForRecentProjectStorage(data);
        const formattedDate = formatDateForRecentProject(data.date);
        const dateSuffix = formattedDate ? ` - ${formattedDate}` : '';
        const projectName = `${data.projectName || 'Untitled SaskPower DFR'}${dateSuffix}`;
        await addRecentProject(stateForSaving, { type: 'dfrSaskpower', name: projectName, projectNumber: data.projectNumber });

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
            docInstance.line(startX, bottomY, endX, bottomY);
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
        
        const drawDfrHeader = (docInstance: any) => {
            const headerContentStartY = contentMargin;
            const logoUrl = "https://ik.imagekit.io/fzpijprte/XTerraLogo2019_Horizontal.jpg?updatedAt=1758827714962";
            docInstance.addImage(logoUrl, 'JPEG', contentMargin, headerContentStartY, 40, 10);
            
            docInstance.setFontSize(18);
            docInstance.setFont('times', 'bold');
            docInstance.setTextColor(0, 125, 140);
            docInstance.text('DAILY FIELD REPORT', pageWidth / 2, headerContentStartY + 7, { align: 'center' });
            
            docInstance.setTextColor(0, 0, 0);
            let yPos = headerContentStartY + 15;
            yPos = drawProjectInfoBlock(docInstance, yPos);
            return yPos + 4;
        };
        
        const renderTextSection = (docInstance: any, currentY: number, title: string, content: string, options: { spaceBefore?: number, box?: boolean } = {}) => {
            let y = currentY;
            const { spaceBefore = 4, box = false } = options;
        
            if (!content || !content.trim()) return y;
            
            const startBoxY = y + spaceBefore;
            if (sectionStartYOnPage === -1) {
                sectionStartYOnPage = startBoxY;
            }
        
            docInstance.setFontSize(13); docInstance.setFont('times', 'bold');
            const titleDims = docInstance.getTextDimensions(title);
            const titleHeight = titleDims.h;
            
            let contentHeight = 0;
            docInstance.setFontSize(12); docInstance.setFont('times', 'normal');
            const contentLines = content.split('\n'); // Keep empty lines
            contentLines.forEach(line => {
                if (line.trim() === '') {
                    contentHeight += 3;
                    return;
                }
                const indentationMatch = line.match(/^\s*/);
                const indentation = indentationMatch ? indentationMatch[0].length : 0;
                const indentLevel = Math.floor(indentation / 2);
                const indentWidth = indentLevel * 5;

                const trimmedLine = line.trim();
                const isBulleted = trimmedLine.startsWith('-');
                const textToRender = isBulleted ? trimmedLine.substring(1).trim() : trimmedLine;

                if (!textToRender) return;

                const textMaxWidth = contentWidth - (isBulleted ? 5 : 0) - indentWidth - (box ? 4 : 0);
                const splitText = docInstance.splitTextToSize(textToRender, textMaxWidth);
                contentHeight += docInstance.getTextDimensions(splitText).h + 2;
            });
        
            const sectionHeight = titleHeight + 2 + contentHeight + (box ? 8 : 0);
        
            if (y + spaceBefore + sectionHeight > maxYPos) {
                flushDrawBuffer(docInstance, y);
                drawPageBorder(docInstance); docInstance.addPage(); pageNum++; y = drawDfrHeader(docInstance);
                sectionStartYOnPage = y;
            } else {
                y += spaceBefore;
            }
        
            const titleY = y + (box ? 4 : 0);
            bufferedDraws.push((doc) => {
                if (box) {
                    doc.setDrawColor(128, 128, 128); doc.setLineWidth(0.25);
                    doc.rect(contentMargin, y, contentWidth, sectionHeight);
                }
                doc.setFontSize(13); doc.setFont('times', 'bold'); doc.text(title, contentMargin + (box ? 2 : 0), titleY);
            });
            y = titleY + titleHeight + 2;
        
            contentLines.forEach(line => {
                if (line.trim() === '') {
                    y += 3;
                    return;
                }

                const indentationMatch = line.match(/^\s*/);
                const indentation = indentationMatch ? indentationMatch[0].length : 0;
                const indentLevel = Math.floor(indentation / 2);
                const indentWidth = indentLevel * 5;

                const trimmedLine = line.trim();
                const isBulleted = trimmedLine.startsWith('-');
                const textToRender = isBulleted ? trimmedLine.substring(1).trim() : trimmedLine;

                if (!textToRender) return;

                const textMaxWidth = contentWidth - (isBulleted ? 5 : 0) - indentWidth - (box ? 4 : 0);
                const splitText = docInstance.splitTextToSize(textToRender, textMaxWidth);
                const textHeight = docInstance.getTextDimensions(splitText).h + 2;

                if (y + textHeight > maxYPos) {
                    flushDrawBuffer(docInstance, y);
                    drawPageBorder(docInstance); docInstance.addPage(); pageNum++; y = drawDfrHeader(docInstance);
                    sectionStartYOnPage = y;
                }
                const lineY = y;
                bufferedDraws.push((doc) => {
                    doc.setFontSize(12); doc.setFont('times', 'normal');
                    const textX = contentMargin + (isBulleted ? 5 : 0) + indentWidth + (box ? 2 : 0);
                    if (isBulleted) {
                        const bulletX = contentMargin + 2 + indentWidth + (box ? 2 : 0);
                        doc.text('-', bulletX, lineY); 
                    }
                    doc.text(splitText, textX, lineY);
                });
                y += textHeight;
            });
            return y + (box ? 4 : 0);
        };
        
        let yPos = drawDfrHeader(doc);
        
        yPos = renderTextSection(doc, yPos, 'Project Activities (detailed description with timestamps):', data.generalActivity);
        flushDrawBuffer(doc, yPos);
        
        const otherTextSections = [
            { title: 'X-Terra Equipment Onsite:', content: data.equipmentOnsite },
            { title: 'Weather and Ground Conditions:', content: data.weatherAndGroundConditions },
            { title: 'Environmental Protection Measures and Mitigation:', content: data.environmentalProtection },
            { title: 'Wildlife Observations:', content: data.wildlifeObservations },
            { title: 'Future Monitoring Requirements:', content: data.futureMonitoring },
        ];
        
        otherTextSections.forEach(({ title, content }) => {
            yPos = renderTextSection(doc, yPos, title, content);
            flushDrawBuffer(doc, yPos);
        });

        const checklistItems = [
            { label: 'Completed/Reviewed X-Terra Tailgate:', value: data.completedTailgate },
            { label: 'Reviewed/Signed Crew Tailgate:', value: data.reviewedTailgate },
            { label: 'Reviewed Permit(s) with Crew(s):', value: data.reviewedPermits },
        ];
        
        const checklistSectionHeight = 4 + (checklistItems.length * 8) + 10;
        if (yPos + checklistSectionHeight > maxYPos) {
            drawPageBorder(doc); doc.addPage(); pageNum++; yPos = drawDfrHeader(doc);
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
        const drawPhotoPageHeader = (docInstance: any) => {
            const startY = borderMargin;
            docInstance.setDrawColor(0, 125, 140);
            docInstance.setLineWidth(0.5);
            docInstance.line(borderMargin, startY, pageWidth - borderMargin, startY);
            const yAfterBlock = drawProjectInfoBlock(docInstance, startY, { drawTopLine: false });
            return yAfterBlock + 1;
        };

        const sitePhotos = photosData.filter(p => !p.isMap && p.imageUrl);
        const mapPhotosData = photosData.filter(p => p.isMap && p.imageUrl);
        
        const calculatePhotoEntryHeight = async (docInstance: any, photo: PhotoData): Promise<number> => {
            const gap = 5; const availableWidth = contentWidth - gap; const textBlockWidth = availableWidth * 0.35;
            const imageBlockWidth = availableWidth * 0.65; docInstance.setFontSize(12); let textHeight = 0;
            const textMetrics = docInstance.getTextDimensions('Photo'); textHeight += textMetrics.h * 0.75;
            const measureField = (label: string, value: string) => {
                const labelText = `${label}:`; docInstance.setFont('times', 'bold');
                const labelWidth = docInstance.getTextWidth(labelText); docInstance.setFont('times', 'normal');
                const valueMaxWidth = textBlockWidth - labelWidth - 2;
                const valueLines = docInstance.splitTextToSize(value || ' ', valueMaxWidth);
                return docInstance.getTextDimensions(valueLines).h + 1.5;
            };
            textHeight += measureField(photo.isMap ? "Map" : "Photo", photo.photoNumber);
            if (!photo.isMap) textHeight += measureField("Direction", photo.direction || 'N/A');
            textHeight += measureField("Date", photo.date); textHeight += measureField("Location", photo.location);
            textHeight += 5; const descLines = docInstance.splitTextToSize(photo.description || ' ', textBlockWidth);
            textHeight += docInstance.getTextDimensions(descLines).h;
            let imageH = 0;
            if (photo.imageUrl) { try { const { width, height } = await getImageDimensions(photo.imageUrl); imageH = height * (imageBlockWidth / width); } catch (e) { console.error("Could not load image", e); }}
            return Math.max(textHeight, imageH);
        };
        
        const drawPhotoEntryText = (docInstance: any, photo: PhotoData, xStart: number, yStart: number, textBlockWidth: number) => {
            docInstance.setFontSize(12); docInstance.setFont('times', 'normal');
            const textMetrics = docInstance.getTextDimensions('Photo'); const ascent = textMetrics.h * 0.75; let textY = yStart + ascent;
            const drawTextField = (label: string, value: string) => {
                docInstance.setFont('times', 'bold'); const labelText = `${label}:`; docInstance.text(labelText, xStart, textY); docInstance.setFont('times', 'normal');
                const labelWidth = docInstance.getTextWidth(labelText); const valueMaxWidth = textBlockWidth - labelWidth - 2;
                const valueLines = docInstance.splitTextToSize(value || ' ', valueMaxWidth); docInstance.text(valueLines, xStart + labelWidth + 2, textY);
                textY += docInstance.getTextDimensions(valueLines).h + 1.5;
            };
            drawTextField(photo.isMap ? "Map" : "Photo", photo.photoNumber); if (!photo.isMap) drawTextField("Direction", photo.direction || 'N/A');
            drawTextField("Date", photo.date); drawTextField("Location", photo.location);
            docInstance.setFont('times', 'bold'); docInstance.text(`Description:`, xStart, textY); textY += 5;
            docInstance.setFont('times', 'normal'); const descLines = docInstance.splitTextToSize(photo.description || ' ', textBlockWidth); docInstance.text(descLines, xStart, textY);
        };
        
        const drawPhotoEntry = async (docInstance: any, photo: PhotoData, yStart: number) => {
            const gap = 5; const availableWidth = contentWidth - gap; const textBlockWidth = availableWidth * 0.35; const imageBlockWidth = availableWidth * 0.65;
            const imageX = contentMargin + textBlockWidth + gap; drawPhotoEntryText(docInstance, photo, contentMargin, yStart, textBlockWidth);
            if (photo.imageUrl) { const { width, height } = await getImageDimensions(photo.imageUrl); const scaledHeight = height * (imageBlockWidth / width); docInstance.addImage(photo.imageUrl, 'JPEG', imageX, yStart, imageBlockWidth, scaledHeight); }
        };

        if (sitePhotos.length > 0) {
            const entryHeights = await Promise.all(sitePhotos.map(p => calculatePhotoEntryHeight(doc, p)));
            const dummyDoc = new jsPDF(); const yAfterHeader = drawPhotoPageHeader(dummyDoc); const pageContentHeight = maxYPos - yAfterHeader;
            const pages: number[][] = []; let currentPageGroup: number[] = []; let currentHeight = 0;
            sitePhotos.forEach((_, i) => {
                const photoHeight = entryHeights[i];
                if (currentPageGroup.length === 0) { currentPageGroup.push(i); currentHeight = photoHeight; }
                else if (currentPageGroup.length === 1) { if (currentHeight + photoHeight + 10 <= pageContentHeight) { currentPageGroup.push(i); } else { pages.push(currentPageGroup); currentPageGroup = [i]; currentHeight = photoHeight; } }
                if (currentPageGroup.length === 2) { pages.push(currentPageGroup); currentPageGroup = []; currentHeight = 0; }
            });
            if (currentPageGroup.length > 0) pages.push(currentPageGroup);
            for (const group of pages) {
                doc.addPage(); pageNum++; let yPosPhoto = drawPhotoPageHeader(doc);
                const photosOnPage = group.map(i => sitePhotos[i]); const heightsOnPage = group.map(i => entryHeights[i]);
                const availableHeight = maxYPos - yPosPhoto;
                if (photosOnPage.length === 1) { await drawPhotoEntry(doc, photosOnPage[0], yPosPhoto); }
                else {
                    const totalContentHeight = heightsOnPage.reduce((sum, h) => sum + h, 0); const tightGap = 4;
                    const totalRemainingSpace = availableHeight - totalContentHeight - (tightGap * 2); const largeGap = totalRemainingSpace > 0 ? totalRemainingSpace / 2 : 2;
                    yPosPhoto += tightGap; await drawPhotoEntry(doc, photosOnPage[0], yPosPhoto); yPosPhoto += heightsOnPage[0];
                    yPosPhoto += largeGap; doc.setDrawColor(0, 125, 140); doc.setLineWidth(0.5); doc.line(borderMargin, yPosPhoto, pageWidth - borderMargin, yPosPhoto);
                    yPosPhoto += tightGap; await drawPhotoEntry(doc, photosOnPage[1], yPosPhoto);
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
            height += 5; const descLines = docInstance.splitTextToSize(photo.description || ' ', textBlockWidth); height += docInstance.getTextDimensions(descLines).h; return height;
        };

        if (mapPhotosData.length > 0) {
            for (const map of mapPhotosData) {
                doc.addPage(); pageNum++; let yPosMap = drawPhotoPageHeader(doc);
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
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i); doc.setFontSize(10); doc.setFont('times', 'normal'); doc.setTextColor(0, 0, 0);
            const footerTextY = pageHeight - borderMargin + 4; doc.text(`Page ${i} of ${totalPages}`, pageWidth - borderMargin, footerTextY, { align: 'right' });
        }
        
        const pdfBlob = doc.output('blob');
        const pdfUrl = URL.createObjectURL(pdfBlob);
        setPdfPreview({ url: pdfUrl, filename });
    };

    const handleSaveProject = async () => {
        const stateForRecentProjects = await prepareStateForRecentProjectStorage(data);
        const formattedDate = formatDateForRecentProject(data.date);
        const dateSuffix = formattedDate ? ` - ${formattedDate}` : '';
        const projectName = `${data.projectName || 'Untitled SaskPower DFR'}${dateSuffix}`;
        await addRecentProject(stateForRecentProjects, { type: 'dfrSaskpower', name: projectName, projectNumber: data.projectNumber });

        const photosForExport = photosData.map(({ imageId, ...photo }) => photo);
        const stateForFileExport = { ...data, photosData: photosForExport };

        const sanitize = (name: string) => name.replace(/[^a-z0-9_]/gi, '-').toLowerCase();
        const formattedFilenameDate = formatDateForFilename(data.date);
        const sanitizedProjectName = sanitize(data.projectName);
        const filename = `${sanitizedProjectName || 'project'}_${formattedFilenameDate}.spdfr`;
        
        // @ts-ignore
        if (window.electronAPI) {
            // @ts-ignore
            await window.electronAPI.saveProject(JSON.stringify(stateForFileExport), filename);
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
        <div className="bg-gray-100 min-h-screen">
            {pdfPreview && (
                <PdfPreviewModal 
                    url={pdfPreview.url} 
                    filename={pdfPreview.filename} 
                    onClose={() => setPdfPreview(null)} 
                />
            )}
            {enlargedImageUrl && (
                <ImageModal imageUrl={enlargedImageUrl} onClose={() => setEnlargedImageUrl(null)} />
            )}
            {showStatusModal && <ActionStatusModal message={statusMessage} />}
            <SpecialCharacterPalette />
            <div className="max-w-7xl mx-auto p-4 md:p-8">
                {showMigrationNotice && (
                    <div className="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 mb-6 rounded-md shadow-sm" role="alert">
                        <div className="flex">
                            <div className="py-1">
                                <svg className="fill-current h-6 w-6 text-blue-500 mr-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M2.93 17.07A10 10 0 1 1 17.07 2.93 10 10 0 0 1 2.93 17.07zm12.73-1.41A8 8 0 1 0 4.34 4.34a8 8 0 0 0 11.32 11.32zM9 11V9h2v6H9v-4zm0-6h2v2H9V5z"/></svg>
                            </div>
                            <div>
                                <p className="font-bold">Project format updated</p>
                                <p className="text-sm">This project was opened in an older format and has been automatically updated. Please save the project to keep these changes.</p>
                            </div>
                            <button onClick={() => setShowMigrationNotice(false)} className="ml-auto -mx-1.5 -my-1.5 bg-blue-100 text-blue-500 rounded-lg focus:ring-2 focus:ring-blue-400 p-1.5 hover:bg-blue-200 inline-flex h-8 w-8" aria-label="Dismiss">
                                <span className="sr-only">Dismiss</span>
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path></svg>
                            </button>
                        </div>
                    </div>
                )}
                <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
                     <button onClick={onBack} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200">
                        <ArrowLeftIcon /> <span>Home</span>
                    </button>
                    <h1 className="text-2xl font-bold text-gray-700">SaskPower Daily Field Report</h1>
                    <div className="flex flex-wrap justify-end gap-2">
                        <button onClick={handleOpenProject} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200">
                            <FolderOpenIcon /> <span>Open</span>
                        </button>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileSelected}
                            style={{ display: 'none' }}
                            accept=".spdfr"
                        />
                        <button onClick={handleSaveProject} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200">
                            <SaveIcon /> <span>Save</span>
                        </button>
                        {/* @ts-ignore */}
                        {!window.electronAPI && (
                            <button onClick={handleDownloadPhotos} className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200">
                                <FolderArrowDownIcon /> <span>Download Photos</span>
                            </button>
                        )}
                        <button onClick={handleSavePdf} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200">
                            <DownloadIcon /> <span>Save PDF</span>
                        </button>
                    </div>
                </div>

                <div className="space-y-8">
                    {/* Header Section */}
                    <Section title="Report Information">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                            <EditableField label="Date" value={data.date} onChange={v => handleChange('date', v)} placeholder="October 1, 2025" isInvalid={errors.has('date')} />
                            <EditableField label="X-Terra Project #" value={data.projectNumber} onChange={v => handleChange('projectNumber', v)} isInvalid={errors.has('projectNumber')} />
                            <EditableField label="Proponent" value={data.proponent} onChange={v => handleChange('proponent', v)} isInvalid={errors.has('proponent')} />
                            <EditableField label="ENV File Number" value={data.envFileNumber} onChange={v => handleChange('envFileNumber', v)} isInvalid={errors.has('envFileNumber')} />
                            <EditableField label="Project" value={data.projectName} onChange={v => handleChange('projectName', v)} isInvalid={errors.has('projectName')} />
                            <EditableField label="Vendor & Foreman" value={data.vendorAndForeman} onChange={v => handleChange('vendorAndForeman', v)} isInvalid={errors.has('vendorAndForeman')} />
                            <EditableField label="Location" value={data.location} onChange={v => handleChange('location', v)} isTextArea rows={2} isInvalid={errors.has('location')} />
                            <EditableField label="Environmental Monitor" value={data.environmentalMonitor} onChange={v => handleChange('environmentalMonitor', v)} isInvalid={errors.has('environmentalMonitor')} />
                            <EditableField label="Total Hours Worked" value={data.totalHoursWorked} onChange={v => handleChange('totalHoursWorked', v)} isInvalid={errors.has('totalHoursWorked')} />
                        </div>
                    </Section>

                    {/* Checklist Section */}
                    <Section title="Safety Checklist">
                        <ChecklistRow label="Completed/Reviewed X-Terra Tailgate" value={data.completedTailgate} onChange={v => handleChange('completedTailgate', v)} />
                        <ChecklistRow label="Reviewed/Signed Crew Tailgate" value={data.reviewedTailgate} onChange={v => handleChange('reviewedTailgate', v)} />
                        <ChecklistRow label="Reviewed Permit(s) with Crew(s)" value={data.reviewedPermits} onChange={v => handleChange('reviewedPermits', v)} />
                    </Section>
                    
                    {/* Main Body Sections */}
                    <Section title="Project Activities & Observations">
                         <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="block text-sm font-medium text-gray-700">Project Activities (detailed description with timestamps)</label>
                                <button onClick={() => toggleComment('generalActivity')} title="Toggle comment" className={`p-1 rounded-full ${openComments.has('generalActivity') ? 'bg-yellow-200 text-yellow-800' : 'text-gray-400 hover:text-gray-600'}`}>
                                    <ChatBubbleLeftIcon className="h-5 w-5" />
                                </button>
                            </div>
                            {openComments.has('generalActivity') && (
                                <textarea value={data.comments?.generalActivity || ''} onChange={(e) => handleCommentChange('generalActivity', e.target.value)} placeholder="Add a comment for editing purposes..." rows={2} className="block w-full p-2 border border-yellow-300 bg-yellow-50 rounded-md shadow-sm focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition mb-2" />
                            )}
                            <BulletPointEditor label="" value={data.generalActivity} onChange={v => handleChange('generalActivity', v)} rows={10} placeholder={activityPlaceholder} isInvalid={errors.has('generalActivity')} />
                        </div>
                        <div>
                             <div className="flex items-center justify-between mb-1">
                                <label className="block text-sm font-medium text-gray-700">X-Terra Equipment Onsite</label>
                                <button onClick={() => toggleComment('equipmentOnsite')} title="Toggle comment" className={`p-1 rounded-full ${openComments.has('equipmentOnsite') ? 'bg-yellow-200 text-yellow-800' : 'text-gray-400 hover:text-gray-600'}`}>
                                    <ChatBubbleLeftIcon className="h-5 w-5" />
                                </button>
                            </div>
                            {openComments.has('equipmentOnsite') && (
                                <textarea value={data.comments?.equipmentOnsite || ''} onChange={(e) => handleCommentChange('equipmentOnsite', e.target.value)} placeholder="Add a comment for editing purposes..." rows={2} className="block w-full p-2 border border-yellow-300 bg-yellow-50 rounded-md shadow-sm focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition mb-2" />
                            )}
                            <BulletPointEditor label="" value={data.equipmentOnsite} onChange={v => handleChange('equipmentOnsite', v)} rows={3} isInvalid={errors.has('equipmentOnsite')} />
                        </div>
                         <div>
                             <div className="flex items-center justify-between mb-1">
                                <label className="block text-sm font-medium text-gray-700">Weather and Ground Conditions</label>
                                <button onClick={() => toggleComment('weatherAndGroundConditions')} title="Toggle comment" className={`p-1 rounded-full ${openComments.has('weatherAndGroundConditions') ? 'bg-yellow-200 text-yellow-800' : 'text-gray-400 hover:text-gray-600'}`}>
                                    <ChatBubbleLeftIcon className="h-5 w-5" />
                                </button>
                            </div>
                            {openComments.has('weatherAndGroundConditions') && (
                                <textarea value={data.comments?.weatherAndGroundConditions || ''} onChange={(e) => handleCommentChange('weatherAndGroundConditions', e.target.value)} placeholder="Add a comment for editing purposes..." rows={2} className="block w-full p-2 border border-yellow-300 bg-yellow-50 rounded-md shadow-sm focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition mb-2" />
                            )}
                            <BulletPointEditor label="" value={data.weatherAndGroundConditions} onChange={v => handleChange('weatherAndGroundConditions', v)} rows={3} isInvalid={errors.has('weatherAndGroundConditions')} />
                        </div>
                         <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="block text-sm font-medium text-gray-700">Environmental Protection Measures and Mitigation</label>
                                <button onClick={() => toggleComment('environmentalProtection')} title="Toggle comment" className={`p-1 rounded-full ${openComments.has('environmentalProtection') ? 'bg-yellow-200 text-yellow-800' : 'text-gray-400 hover:text-gray-600'}`}>
                                    <ChatBubbleLeftIcon className="h-5 w-5" />
                                </button>
                            </div>
                            {openComments.has('environmentalProtection') && (
                                <textarea value={data.comments?.environmentalProtection || ''} onChange={(e) => handleCommentChange('environmentalProtection', e.target.value)} placeholder="Add a comment for editing purposes..." rows={2} className="block w-full p-2 border border-yellow-300 bg-yellow-50 rounded-md shadow-sm focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition mb-2" />
                            )}
                            <BulletPointEditor label="" value={data.environmentalProtection} onChange={v => handleChange('environmentalProtection', v)} rows={4} isInvalid={errors.has('environmentalProtection')} />
                        </div>
                         <div>
                             <div className="flex items-center justify-between mb-1">
                                <label className="block text-sm font-medium text-gray-700">Wildlife Observations</label>
                                <button onClick={() => toggleComment('wildlifeObservations')} title="Toggle comment" className={`p-1 rounded-full ${openComments.has('wildlifeObservations') ? 'bg-yellow-200 text-yellow-800' : 'text-gray-400 hover:text-gray-600'}`}>
                                    <ChatBubbleLeftIcon className="h-5 w-5" />
                                </button>
                            </div>
                            {openComments.has('wildlifeObservations') && (
                                <textarea value={data.comments?.wildlifeObservations || ''} onChange={(e) => handleCommentChange('wildlifeObservations', e.target.value)} placeholder="Add a comment for editing purposes..." rows={2} className="block w-full p-2 border border-yellow-300 bg-yellow-50 rounded-md shadow-sm focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition mb-2" />
                            )}
                            <BulletPointEditor label="" value={data.wildlifeObservations} onChange={v => handleChange('wildlifeObservations', v)} rows={3} isInvalid={errors.has('wildlifeObservations')} />
                        </div>
                         <div>
                             <div className="flex items-center justify-between mb-1">
                                <label className="block text-sm font-medium text-gray-700">Future Monitoring Requirements</label>
                                <button onClick={() => toggleComment('futureMonitoring')} title="Toggle comment" className={`p-1 rounded-full ${openComments.has('futureMonitoring') ? 'bg-yellow-200 text-yellow-800' : 'text-gray-400 hover:text-gray-600'}`}>
                                    <ChatBubbleLeftIcon className="h-5 w-5" />
                                </button>
                            </div>
                            {openComments.has('futureMonitoring') && (
                                <textarea value={data.comments?.futureMonitoring || ''} onChange={(e) => handleCommentChange('futureMonitoring', e.target.value)} placeholder="Add a comment for editing purposes..." rows={2} className="block w-full p-2 border border-yellow-300 bg-yellow-50 rounded-md shadow-sm focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition mb-2" />
                            )}
                            <BulletPointEditor label="" value={data.futureMonitoring} onChange={v => handleChange('futureMonitoring', v)} rows={3} isInvalid={errors.has('futureMonitoring')} />
                        </div>
                    </Section>

                    {/* Photo Log Section */}
                    <div className="border-t-4 border-[#007D8C] my-10" />
                    <h2 className="text-3xl font-bold text-gray-700 text-center">Photographic Log</h2>

                    <div>
                        {photosData.map((photo, index) => (
                           <div key={photo.id}>
                                <PhotoEntry
                                    data={photo}
                                    onDataChange={(field, value) => handlePhotoDataChange(photo.id, field, value)}
                                    onImageChange={(file) => handleImageChange(photo.id, file)}
                                    onRemove={() => removePhoto(photo.id)}
                                    onMoveUp={() => movePhoto(photo.id, 'up')}
                                    onMoveDown={() => movePhoto(photo.id, 'down')}
                                    isFirst={index === 0}
                                    isLast={index === photosData.length - 1}
                                    onImageClick={setEnlargedImageUrl}
                                    errors={getPhotoErrors(photo.id)}
                                    showDirectionField={!photo.isMap}
                                />
                                {index < photosData.length - 1 && (
                                    <div className="relative my-6 flex items-center justify-center">
                                        <div className="absolute inset-0 flex items-center" aria-hidden="true"><div className="w-full border-t-2 border-gray-300"></div></div>
                                        <div className="relative">
                                            <button onClick={() => addPhoto(index)} className="bg-white hover:bg-gray-100 text-[#007D8C] font-bold py-2 px-4 rounded-full border border-gray-300 inline-flex items-center gap-2 transition duration-200 shadow-sm">
                                                <PlusIcon /><span>Add Photo Here</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                    
                    <div className="mt-8 flex justify-center">
                        <button onClick={() => addPhoto()} className="bg-[#007D8C] hover:bg-[#006b7a] text-white font-bold py-3 px-6 rounded-lg shadow-md inline-flex items-center gap-2 transition duration-200 text-lg">
                            <PlusIcon /><span>Add Photo</span>
                        </button>
                    </div>
                </div>
                <footer className="text-center text-gray-500 text-sm py-4 mt-8">
                    X-TES Digital Reporting v1.0.5
                </footer>
            </div>
            {showUnsupportedFileModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 transition-opacity duration-300">
                    <div className="bg-white p-8 rounded-lg shadow-2xl text-center relative max-w-md transform scale-95 hover:scale-100 transition-transform duration-300">
                        <button
                            onClick={() => setShowUnsupportedFileModal(false)}
                            className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-700 transition-colors"
                            aria-label="Close"
                        >
                            <CloseIcon className="h-6 w-6" />
                        </button>
                        <img
                            src="https://ik.imagekit.io/fzpijprte/200.gif?updatedAt=1758919911063"
                            alt="Unsupported file type animation"
                            className="mx-auto mb-4 w-40 h-40"
                        />
                        <h3 className="text-2xl font-bold mb-2 text-gray-800">Unsupported File Type</h3>
                        <p className="text-gray-600">
                            Please upload a supported image file.
                        </p>
                        <p className="text-sm text-gray-500 mt-3">
                            Supported formats: <strong>JPG, PNG</strong>
                        </p>
                    </div>
                </div>
            )}
            {showValidationErrorModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 transition-opacity duration-300">
                    <div className="bg-white p-8 rounded-lg shadow-2xl text-center relative max-w-md transform scale-95 hover:scale-100 transition-transform duration-300">
                        <button
                            onClick={() => setShowValidationErrorModal(false)}
                            className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-700 transition-colors"
                            aria-label="Close"
                        >
                            <CloseIcon className="h-6 w-6" />
                        </button>
                        <img
                            src="https://ik.imagekit.io/fzpijprte/200.gif?updatedAt=1758919911063"
                            alt="Missing information animation"
                            className="mx-auto mb-4 w-40 h-40"
                        />
                        <h3 className="text-2xl font-bold mb-2 text-gray-800">Missing Information</h3>
                        <p className="text-gray-600">
                            Please fill in all required fields.
                        </p>
                        <p className="text-sm text-gray-500 mt-3">
                            Missing fields are highlighted in red.
                        </p>
                    </div>
                </div>
            )}
             {showNoInternetModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
                    <div className="bg-white p-8 rounded-lg shadow-2xl text-center relative max-w-md">
                        <button onClick={() => setShowNoInternetModal(false)} className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-700" aria-label="Close"><CloseIcon className="h-6 w-6" /></button>
                        <h3 className="text-2xl font-bold mb-2 text-gray-800">No Internet Connection</h3>
                        <p className="text-gray-600">An internet connection is required to save the PDF. Please connect to the internet and try again.</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DfrSaskpower;