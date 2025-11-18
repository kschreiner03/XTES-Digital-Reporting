import React, { useState, ReactElement, useEffect, useRef, useCallback } from 'react';
import { DfrHeader } from './DfrHeader';
import PhotoEntry from './PhotoEntry';
import type { DfrHeaderData, DfrStandardBodyData, PhotoData, ActivityBlock, LocationActivity } from '../types';
import { PlusIcon, DownloadIcon, SaveIcon, FolderOpenIcon, ArrowLeftIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon, CloseIcon, FolderArrowDownIcon, ChatBubbleLeftIcon } from './icons';
import { AppType } from '../App';
import { storeImage, retrieveImage, deleteImage, storeProject, deleteProject, retrieveProject } from './db';
import { SpecialCharacterPalette } from './SpecialCharacterPalette';
import BulletPointEditor from './BulletPointEditor';
import ImageModal from './ImageModal';
import ActionStatusModal from './ActionStatusModal';


// @ts-ignore
const { jsPDF } = window.jspdf;
declare const JSZip: any;

const dfrPlaceholders = {
    header: {
        proponent: "Cenovus",
        projectName: "Rush Lake SWD Pipeline",
        location: "Rush Lake Thermal (NW-2, NE-3, NW-3-48-21 W3M)",
        projectNumber: "25159",
        monitor: "John Doe",
        envFileValue: "24-S-00084"
    },
    body: {
        generalActivity: `- Travelled to A9-3-48-21 W3M, reviewed and signed onto the safe work permit and ERP at site. Completed X-Terra tailgate safety meeting.
- Equipment and utility/pickup trucks were visually inspected for cleanliness and leaks. All units were free of non-project associated soil and vegetative debris and appear to be free of leaks. Vehicles had a significant amount of road grime present due to overnight rain and soft road conditions. The respective operators completed daily inspections on their equipment for leaks.
- Bandit Energy Services was on site with a JD 345 excavator, Hitachi 345 excavator, Cat D6 dozer, Kubota skid steer, three side booms, and several supervisor and crew trucks.
- Significant amounts of rainfall over the weekend led to soft and wet conditions in the areas surrounding the right of way (RoW). Ground conditions were assessed upon arrival to site and continually throughout the day. The predominance of sand in the upper meter of soil along the RoW allowed for adequate drainage of moisture and resulted in very stable ground conditions. The go-ahead to continue work along the RoW was given and RoW conditions were closely monitored. No rutting or compaction occurred as a result of RoW activities.
- One of the excavators continued to strip subsoil from RoW in NW-3-48-21 W3M, working from east to west between the HPPL crossing and the Rush Lake 1 (RLC1) facility. The subsoil was stored >1m away from the stockpiled topsoil along the south RoW boundary.
- Sand blasting of the HDD drag section welds in NW-2-48-21 W3M was conducted in preparation for coating, using a crew truck towing a mobile sand-blasting unit.
- Returned to base.`,
        communication: `- A tailgate meeting and hazard assessment were performed to identify hazards on site.
- Communication with Cenovus representative on the work scope and findings.`,
        weatherAndGroundConditions: `- Wind from the SW at 15-30km/hr. Overcast skies throughout the day with periods of light rain.
- Temperatures ranged from -1 to 3°C.
- Ground conditions on the RoW were damp but stable.`,
        environmentalProtection: `- All equipment was inspected for cleanliness, leaks, and soil/weeds prior to entry.
- Regulatory approvals, project proposals, project maps, and other pertinent regulatory information was provided to the contractor(s) by Cenovus.
- Spill kits were available at the worksite.
- Re-fueling of any equipment took place at staging areas, with no re-fueling within 100m of any watercourse or waterbody.
- Work was completed under dry, firm, and stable ground conditions.
- Equipment was staged away from any sensitivities.
- Equipment was periodically visually inspected by the operators and monitor during the work period.`,
        wildlifeObservations: "- Common Raven",
        furtherRestoration: "- An environmental monitor will be required for all project activities in accordance with the Ministry of Environment’s Approval conditions.",
    }
};


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
// --- End Utility ---

// --- Helper function to get image dimensions asynchronously
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
            const canvasHeight = 768; // 4:3 aspect ratio

            canvas.width = canvasWidth;
            canvas.height = canvasHeight;

            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const targetAspectRatio = canvasWidth / canvasHeight;
            const originalAspectRatio = img.width / img.height;

            let drawWidth, drawHeight, drawX, drawY;

            if (originalAspectRatio > targetAspectRatio) {
                // Image is wider than target, fit to width
                drawWidth = canvas.width;
                drawHeight = drawWidth / originalAspectRatio;
                drawX = 0;
                drawY = (canvas.height - drawHeight) / 2;
            } else {
                // Image is taller than target, fit to height
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


interface DfrStandardProps {
  onBack: () => void;
  initialData?: any;
}

const formatDateForRecentProject = (dateString: string): string => {
    if (!dateString) return '';
    try {
        const tempDate = new Date(dateString);
        if (isNaN(tempDate.getTime())) {
            return dateString; // Return original if invalid
        }
        // Use local methods to get the components of the date the user intended
        const year = tempDate.getFullYear();
        const month = tempDate.getMonth();
        const day = tempDate.getDate();

        // Reconstruct as a UTC date to avoid timezone shifts during formatting
        const utcDate = new Date(Date.UTC(year, month, day));
        
        const formattedYear = utcDate.getUTCFullYear();
        const formattedMonth = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
        const formattedDay = String(utcDate.getUTCDate()).padStart(2, '0');

        return `${formattedYear}/${formattedMonth}/${formattedDay}`;
    } catch (e) {
        return dateString; // Fallback
    }
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
        // A simple fallback for unexpected formats
        return dateString.replace(/[^a-z0-9]/gi, '');
    }
};

// --- Local UI Components ---
const Section: React.FC<{ title: string; children: React.ReactNode; }> = ({ title, children }) => (
    <div className="bg-white p-6 shadow-md rounded-lg">
        <h2 className="text-xl font-bold text-gray-800 border-b-2 border-gray-200 pb-2 mb-4">{title}</h2>
        <div className="space-y-4">{children}</div>
    </div>
);

const EditableField: React.FC<{ label: string; value: string; onChange: (value: string) => void; type?: string; isTextArea?: boolean; rows?: number; placeholder?: string; }> = ({ label, value, onChange, type = 'text', isTextArea = false, rows = 1, placeholder = '' }) => {
    const commonClasses = "block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-[#007D8C] focus:border-[#007D8C] transition";
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
                    spellCheck={true}
                />
            )}
        </div>
    );
};

const activityPlaceholder = `08:00– Left accommodation for project site #1.
09:00 – Arrive at structure #1. Met crew...
... detailed activity log ...
16:00 – Finish day and head back to accommodation. Complete DFR.`;

const LocationBlockEntry: React.FC<{
    data: LocationActivity;
    onDataChange: (id: number, field: keyof Omit<LocationActivity, 'id'>, value: string) => void;
    onRemove: (id: number) => void;
    onMove: (id: number, direction: 'up' | 'down') => void;
    isFirst: boolean;
    isLast: boolean;
}> = ({ data, onDataChange, onRemove, onMove, isFirst, isLast }) => {
    const [isCommentOpen, setIsCommentOpen] = useState(false);
    return (
        <div className="p-4 border border-gray-200 rounded-md">
            <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-600">Location Specific Activity</h3>
                    <button
                        onClick={() => setIsCommentOpen(!isCommentOpen)}
                        title="Toggle comment"
                        className={`p-1 rounded-full ${isCommentOpen ? 'bg-yellow-200 text-yellow-800' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        <ChatBubbleLeftIcon className="h-5 w-5" />
                    </button>
                </div>
                <div className="flex items-center space-x-2">
                    <button onClick={() => onMove(data.id, 'up')} disabled={isFirst} className="p-1 text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition duration-200" aria-label="Move Up">
                        <ArrowUpIcon className="h-6 w-6" />
                    </button>
                    <button onClick={() => onMove(data.id, 'down')} disabled={isLast} className="p-1 text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition duration-200" aria-label="Move Down">
                        <ArrowDownIcon className="h-6 w-6" />
                    </button>
                    <button onClick={() => onRemove(data.id)} className="p-1 text-red-500 hover:text-red-700 transition duration-200" aria-label="Remove Location Activity">
                        <TrashIcon className="h-6 w-6" />
                    </button>
                </div>
            </div>
             {isCommentOpen && (
                 <textarea
                    value={data.comment || ''}
                    onChange={(e) => onDataChange(data.id, 'comment', e.target.value)}
                    placeholder="Add a comment for this location..."
                    rows={2}
                    className="block w-full p-2 border border-yellow-300 bg-yellow-50 rounded-md shadow-sm focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition mb-2"
                />
            )}
            <div className="space-y-4">
                <EditableField label="Location" value={data.location || ''} onChange={v => onDataChange(data.id, 'location', v)} />
                <BulletPointEditor label="Activities (detailed description with timestamps)" value={data.activities} onChange={v => onDataChange(data.id, 'activities', v)} rows={8} placeholder={activityPlaceholder} />
            </div>
        </div>
    );
};


const DfrStandard = ({ onBack, initialData }: DfrStandardProps): ReactElement => {
    const [headerData, setHeaderData] = useState<DfrHeaderData>({
        proponent: '',
        projectName: '',
        location: '',
        date: '',
        projectNumber: '',
        monitor: '',
        envFileType: 'MOE FILE #',
        envFileValue: '',
    });
    
    const [bodyData, setBodyData] = useState<DfrStandardBodyData>({
        generalActivity: '',
        locationActivities: [],
        communication: '',
        weatherAndGroundConditions: '',
        environmentalProtection: '',
        wildlifeObservations: '',
        furtherRestoration: '',
        comments: {},
    });

    const [photosData, setPhotosData] = useState<PhotoData[]>([]);
    
    const [errors, setErrors] = useState(new Set<string>());
    const [showValidationErrorModal, setShowValidationErrorModal] = useState(false);
    const [showNoInternetModal, setShowNoInternetModal] = useState(false);
    const [showMigrationNotice, setShowMigrationNotice] = useState(false);
    const [enlargedImageUrl, setEnlargedImageUrl] = useState<string | null>(null);
    const [showUnsupportedFileModal, setShowUnsupportedFileModal] = useState<boolean>(false);
    const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string } | null>(null);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [openComments, setOpenComments] = useState<Set<string>>(new Set());
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isDownloadingRef = useRef(false);

     const parseAndLoadProject = async (fileContent: string) => {
        try {
            const projectData = JSON.parse(fileContent);
            const { headerData: loadedHeader, bodyData: loadedBody, textData: loadedText, photosData: loadedPhotos } = projectData;

            if (loadedHeader && (loadedBody || loadedText) && loadedPhotos && Array.isArray(loadedPhotos)) {
                
                let migrationOccurred = false;
                let finalBodyData: DfrStandardBodyData;

                // Check for new format first
                if (loadedBody.generalActivity !== undefined || loadedBody.locationActivities !== undefined) {
                    finalBodyData = {
                        ...bodyData, // start with defaults
                        ...loadedBody,
                        generalActivity: loadedBody.generalActivity || '',
                        locationActivities: loadedBody.locationActivities || [],
                    };
                } else { // Old format, needs migration
                    migrationOccurred = true;
                    let general = '';
                    let locations: LocationActivity[] = [];

                    if (loadedBody.activityBlocks && Array.isArray(loadedBody.activityBlocks)) {
                        const generalBlock = loadedBody.activityBlocks.find((b: ActivityBlock) => b.type === 'general');
                        general = generalBlock ? generalBlock.activities : '';
                        locations = loadedBody.activityBlocks
                            .filter((b: ActivityBlock) => b.type === 'location')
                            .map(({ id, location, activities }: ActivityBlock) => ({ id, location: location || '', activities }));
                    } else if (loadedBody.projectActivities) { // even older format
                        general = loadedBody.projectActivities;
                    } else if (loadedText && loadedText.projectActivities) { // legacy textData format
                         general = loadedText.projectActivities;
                    }
                    
                    finalBodyData = {
                        generalActivity: general,
                        locationActivities: locations,
                        communication: loadedBody.communication || loadedText?.communication || '',
                        weatherAndGroundConditions: loadedBody.weatherAndGroundConditions || loadedText?.weatherAndGroundConditions ||'',
                        environmentalProtection: loadedBody.environmentalProtection || loadedText?.environmentalProtection || '',
                        wildlifeObservations: loadedBody.wildlifeObservations || loadedText?.wildlifeObservations || '',
                        furtherRestoration: loadedBody.furtherRestoration || loadedText?.furtherRestoration || '',
                    };
                }
                
                let loadedHeaderWithDefaults = { ...headerData, ...loadedHeader };
                if (loadedHeader.envFile !== undefined) {
                    migrationOccurred = true;
                    loadedHeaderWithDefaults.envFileType = 'ENV File #';
                    loadedHeaderWithDefaults.envFileValue = loadedHeader.envFile;
                    delete (loadedHeaderWithDefaults as any).envFile;
                }

                setHeaderData(loadedHeaderWithDefaults);
                setBodyData(finalBodyData);

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

                if (migrationOccurred) {
                    setShowMigrationNotice(true);
                }
                
                const formattedDate = formatDateForRecentProject(loadedHeaderWithDefaults.date);
                const dateSuffix = formattedDate ? ` - ${formattedDate}` : '';
                const projectName = `${loadedHeaderWithDefaults.projectName || 'Untitled DFR'}${dateSuffix}`;

                const stateForRecent = { headerData: loadedHeaderWithDefaults, bodyData: finalBodyData, photosData };
                await addRecentProject(stateForRecent, {
                    type: 'dfrStandard',
                    name: projectName,
                    projectNumber: loadedHeaderWithDefaults.projectNumber
                });
            } else {
                alert('Invalid project file format.');
            }
        } catch (error) {
            alert('Error parsing project file. Ensure it is a valid project file.');
            console.error(error);
        }
    };

    useEffect(() => {
        const loadInitialData = async () => {
            if (initialData) {
                 const { headerData: loadedHeader, bodyData: loadedBody, photosData: loadedPhotos } = initialData;
                 setHeaderData(loadedHeader || {});
                 
                 // Handle migration on open from recent projects list
                if (loadedBody.generalActivity !== undefined || loadedBody.locationActivities !== undefined) {
                    setBodyData(loadedBody);
                } else {
                    let general = '';
                    let locations: LocationActivity[] = [];
                    if (loadedBody.activityBlocks && Array.isArray(loadedBody.activityBlocks)) {
                        const generalBlock = loadedBody.activityBlocks.find((b: ActivityBlock) => b.type === 'general');
                        general = generalBlock ? generalBlock.activities : '';
                        locations = loadedBody.activityBlocks
                            .filter((b: ActivityBlock) => b.type === 'location')
                            .map(({ id, location, activities }: ActivityBlock) => ({ id, location: location || '', activities }));
                    } else if (loadedBody.projectActivities) {
                        general = loadedBody.projectActivities;
                    }
                    setBodyData({
                        generalActivity: general,
                        locationActivities: locations,
                        communication: loadedBody.communication || '',
                        weatherAndGroundConditions: loadedBody.weatherAndGroundConditions || '',
                        environmentalProtection: loadedBody.environmentalProtection || '',
                        wildlifeObservations: loadedBody.wildlifeObservations || '',
                        furtherRestoration: loadedBody.furtherRestoration || '',
                    });
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
                }
            } else {
                // Load defaults for new projects
                try {
                    const settings = JSON.parse(localStorage.getItem('xtec_general_settings') || '{}');
                    setHeaderData(prev => ({
                        ...prev,
                        proponent: settings.defaultProponent || prev.proponent,
                        monitor: settings.defaultMonitor || prev.monitor
                    }));
                } catch (e) {
                    console.error("Failed to load settings", e);
                }
            }
        };
        loadInitialData();
    }, [initialData]);


    const handleHeaderChange = (field: keyof DfrHeaderData, value: string) => {
        setHeaderData(prev => ({ ...prev, [field]: value }));
    };
    
    const handleBodyDataChange = (field: keyof Omit<DfrStandardBodyData, 'activityBlocks' | 'generalActivity' | 'locationActivities' | 'comments'>, value: string) => {
        setBodyData(prev => ({ ...prev, [field]: value }));
    };

    const handleGeneralActivityChange = (value: string) => {
        setBodyData(prev => ({ ...prev, generalActivity: value }));
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
        setBodyData(prev => ({
            ...prev,
            comments: {
                ...prev.comments,
                [field]: value
            }
        }));
    };

    // --- Location Activity Handlers ---
    const addLocationActivity = () => {
        const newId = bodyData.locationActivities.length > 0 ? Math.max(...bodyData.locationActivities.map(a => a.id)) + 1 : 1;
        const newBlock: LocationActivity = {
            id: newId,
            location: '',
            activities: '',
        };
        setBodyData(prev => ({
            ...prev,
            locationActivities: [...prev.locationActivities, newBlock]
        }));
    };

    const removeLocationActivity = (id: number) => {
        setBodyData(prev => ({
            ...prev,
            locationActivities: prev.locationActivities.filter(a => a.id !== id)
        }));
    };

    const updateLocationActivity = (id: number, field: keyof Omit<LocationActivity, 'id'>, value: string) => {
        setBodyData(prev => ({
            ...prev,
            locationActivities: prev.locationActivities.map(block =>
                block.id === id ? { ...block, [field]: value } : block
            )
        }));
    };

    const moveLocationActivity = (id: number, direction: 'up' | 'down') => {
        const index = bodyData.locationActivities.findIndex(a => a.id === id);
        if (index === -1) return;

        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= bodyData.locationActivities.length) return;

        const newActivities = [...bodyData.locationActivities];
        [newActivities[index], newActivities[newIndex]] = [newActivities[newIndex], newActivities[index]];

        setBodyData(prev => ({ ...prev, locationActivities: newActivities }));
    };


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

    const addPhoto = (isMap: boolean = false, insertAtIndex?: number) => {
        const newId = photosData.length > 0 ? Math.max(...photosData.map(p => p.id)) + 1 : 1;
        const newPhoto: PhotoData = {
            id: newId,
            photoNumber: '', // Will be renumbered
            date: headerData.date, // Auto-populate with header date
            location: '',
            description: '',
            imageUrl: null,
            direction: '',
            isMap,
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
    
    const prepareStateForRecentProjectStorage = async () => {
        const photosForStorage = await Promise.all(
            photosData.map(async (photo) => {
                if (photo.imageUrl) {
                    const imageId = photo.imageId || `${headerData.projectNumber || 'proj'}-${photo.id}-${Date.now()}`;
                    await storeImage(imageId, photo.imageUrl);
                    const { imageUrl, ...rest } = photo;
                    return { ...rest, imageId };
                }
                return photo;
            })
        );
        return { headerData, bodyData, photosData: photosForStorage };
    };

    const handleSaveProject = async () => {
        // First, save to the "Recent Projects" list, which uses IndexedDB for images
        const stateForRecentProjects = await prepareStateForRecentProjectStorage();
        
        const formattedDate = formatDateForRecentProject(headerData.date);
        const dateSuffix = formattedDate ? ` - ${formattedDate}` : '';
        const projectName = `${headerData.projectName || 'Untitled DFR'}${dateSuffix}`;

        await addRecentProject(stateForRecentProjects, {
            type: 'dfrStandard',
            name: projectName,
            projectNumber: headerData.projectNumber,
        });
        
        // Second, prepare a self-contained state for file export with embedded images
        const photosForExport = photosData.map(({ imageId, ...photo }) => photo);
        const stateForFileExport = { headerData, bodyData, photosData: photosForExport };

        const sanitize = (name: string) => name.replace(/[^a-z0-9_]/gi, '-').toLowerCase();
        const formattedFilenameDate = formatDateForFilename(headerData.date);
        const sanitizedProjectName = sanitize(headerData.projectName);
        const filename = `${sanitizedProjectName || 'project'}_${formattedFilenameDate}.dfr`;
        
        // Save the self-contained state to a file
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
            const zipFilename = `${sanitize(headerData.projectNumber) || 'project'}_${sanitize(headerData.projectName) || 'dfr'}_Photos.zip`;
            
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
    }, [photosData, headerData]);

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


    const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const fileContent = await file.text();
        await parseAndLoadProject(fileContent);
       
        if (event.target) {
            event.target.value = '';
        }
    };

    const handleOpenProject = async () => {
        // @ts-ignore
        if (window.electronAPI) {
            // @ts-ignore
            const fileContent = await window.electronAPI.loadProject('dfr');
            if (fileContent) {
                await parseAndLoadProject(fileContent);
            }
        } else {
            fileInputRef.current?.click();
        }
    };

    const validateForm = (): boolean => {
        const newErrors = new Set<string>();

        // Header validation
        const requiredHeaderKeys: (keyof DfrHeaderData)[] = ['proponent', 'projectName', 'location', 'date', 'projectNumber', 'monitor'];
        requiredHeaderKeys.forEach(key => {
            const value = headerData[key];
            if (!value || (typeof value === 'string' && !value.trim())) {
                newErrors.add(key);
            }
        });

        // Body validation
        if (!bodyData.generalActivity.trim() && bodyData.locationActivities.length === 0) {
            newErrors.add('generalActivity'); // Mark one of them
        }
        const requiredBodyKeys: (keyof DfrStandardBodyData)[] = ['communication', 'weatherAndGroundConditions', 'environmentalProtection', 'wildlifeObservations', 'furtherRestoration'];
        requiredBodyKeys.forEach(key => {
            // @ts-ignore
            const value = bodyData[key];
            if (!value || (typeof value === 'string' && !value.trim())) {
                newErrors.add(key);
            }
        });

        // Photo validation
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

        const stateForSaving = await prepareStateForRecentProjectStorage();
    
        const formattedDate = formatDateForRecentProject(headerData.date);
        const dateSuffix = formattedDate ? ` - ${formattedDate}` : '';
        const projectName = `${headerData.projectName || 'Untitled DFR'}${dateSuffix}`;

        await addRecentProject(stateForSaving, {
            type: 'dfrStandard',
            name: projectName,
            projectNumber: headerData.projectNumber
        });

        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'letter' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        
        const borderMargin = 12.7;
        const contentPadding = 4;
        const contentMargin = borderMargin + contentPadding;
        const contentWidth = pageWidth - contentMargin * 2;
        
        const maxYPos = pageHeight - contentMargin;
        let pageNum = 1;

        const drawPageBorder = (docInstance: any) => {
            docInstance.setDrawColor(0, 125, 140); // Teal
            docInstance.setLineWidth(0.5);
            const startX = borderMargin;
            const endX = pageWidth - borderMargin;
            const bottomY = pageHeight - borderMargin;

            // Bottom line only
            docInstance.line(startX, bottomY, endX, bottomY);
        };

        const drawProjectInfoBlock = (docInstance: any, startY: number, options: { drawTopLine?: boolean, drawBottomLine?: boolean } = {}) => {
            const { drawTopLine = true, drawBottomLine = true } = options;
            
            const blockPaddingTop = 4;
            const blockPaddingBottom = 0; // Move line up
            
            let yPos = startY + blockPaddingTop;

            const drawField = (label: string, value: string, x: number, y: number, maxWidth: number): number => {
                const labelText = (label || '').toUpperCase();
                
                docInstance.setFontSize(12);
                docInstance.setFont('times', 'bold');
                const labelWidth = docInstance.getTextWidth(labelText);
                docInstance.text(labelText, x, y);
                
                docInstance.setFontSize(11);
                docInstance.setFont('times', 'normal');
                const valueMaxWidth = maxWidth - labelWidth - 2;
                const valueLines = docInstance.splitTextToSize(value || ' ', valueMaxWidth);
                docInstance.text(valueLines, x + labelWidth + 2, y);
                
                return docInstance.getTextDimensions(valueLines).h;
            };

            const col1Fields = [
                {label: 'DATE:', value: headerData.date},
                {label: 'PROPONENT:', value: headerData.proponent},
                {label: 'LOCATION:', value: headerData.location},
            ];
            const col2Fields = [
                {label: 'Project #:', value: headerData.projectNumber},
                {label: 'MONITOR:', value: headerData.monitor},
                {label: `${headerData.envFileType}:`, value: headerData.envFileValue},
            ];
            const fullWidthFields = [
                {label: 'PROJECT NAME:', value: headerData.projectName},
            ];
        
            const col1X = contentMargin;
            const col1MaxWidth = contentWidth * 0.55;
            const col2X = contentMargin + contentWidth * 0.60;
            const col2MaxWidth = contentWidth * 0.40;
            
            let yPos1 = yPos;
            let yPos2 = yPos;
        
            col1Fields.forEach(field => {
                const height = drawField(field.label, field.value, col1X, yPos1, col1MaxWidth);
                yPos1 += height + 1.5;
            });
        
            col2Fields.forEach(field => {
                const height = drawField(field.label, field.value, col2X, yPos2, col2MaxWidth);
                yPos2 += height + 1.5;
            });
        
            yPos = Math.max(yPos1, yPos2);
        
            fullWidthFields.forEach(field => {
                const height = drawField(field.label, field.value, contentMargin, yPos, contentWidth);
                yPos += height + 1.5;
            });


            const fieldsEndY = yPos;
            const blockBottomY = fieldsEndY - 1.5 + blockPaddingBottom;
            
            docInstance.setDrawColor(0, 125, 140); // Teal
            docInstance.setLineWidth(0.5);
            if (drawTopLine) {
                docInstance.line(borderMargin, startY, pageWidth - borderMargin, startY);
            }
            if (drawBottomLine) {
                docInstance.line(borderMargin, blockBottomY, pageWidth - borderMargin, blockBottomY);
            }

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
            
            return yPos + 6; // Keep content in same spot by increasing padding here
        };

        const drawPhotoPageHeader = (docInstance: any) => {
            const startY = borderMargin;

            const headerContentStartY = contentMargin;

            const logoUrl = "https://ik.imagekit.io/fzpijprte/XTerraLogo2019_Horizontal.jpg?updatedAt=1758827714962";

            docInstance.addImage(logoUrl, 'JPEG', contentMargin, headerContentStartY, 40, 10);

            docInstance.setFontSize(18);
            docInstance.setFont('times', 'bold');
            docInstance.setTextColor(0, 125, 140);
            const titleY = headerContentStartY + 7;
            docInstance.text('PHOTOGRAPHIC LOG', pageWidth / 2, titleY, { align: 'center' });
            
            docInstance.setTextColor(0, 0, 0);
            
            let yPos = headerContentStartY + 15;
            
            // Manually draw the top line since drawPageBorder no longer does it.
            docInstance.setDrawColor(0, 125, 140); // Teal
            docInstance.setLineWidth(0.5);
            docInstance.line(borderMargin, yPos, pageWidth - borderMargin, yPos);

            // The project info block is positioned at the top and should not draw its own top line
            const yAfterBlock = drawProjectInfoBlock(docInstance, yPos, { drawTopLine: false });
            return yAfterBlock + 1;
        };
        
        let yPos = drawDfrHeader(doc);
        
        const renderTextWithBullets = (text: string, startY: number) => {
            let y = startY;
            doc.setFontSize(12);
            doc.setFont('times', 'normal');
            if (!text) return y;
            const contentParagraphs = text.split('\n');

            contentParagraphs.forEach(paragraph => {
                if (paragraph.trim() === '') {
                    if (y + 3 <= maxYPos) { y += 3; }
                    return;
                }
                
                const indentationMatch = paragraph.match(/^\s*/);
                const indentation = indentationMatch ? indentationMatch[0].length : 0;
                const indentLevel = Math.floor(indentation / 2);
                const indentWidth = indentLevel * 5;

                const trimmedPara = paragraph.trim();
                const isBulleted = trimmedPara.startsWith('-');
                const textToRender = isBulleted ? trimmedPara.substring(1).trim() : trimmedPara;

                if (!textToRender) return;

                const textMaxWidth = contentWidth - (isBulleted ? 5 : 0) - indentWidth;
                const splitText = doc.splitTextToSize(textToRender, textMaxWidth);
                const textHeight = doc.getTextDimensions(splitText).h;

                if (y + textHeight > maxYPos) {
                    drawPageBorder(doc); doc.addPage(); pageNum++; y = drawDfrHeader(doc);
                    doc.setFontSize(12); doc.setFont('times', 'normal');
                }
                
                const textX = contentMargin + (isBulleted ? 5 : 0) + indentWidth;

                if (isBulleted) {
                    const bulletX = contentMargin + 2 + indentWidth;
                    doc.text('-', bulletX, y);
                }
                doc.text(splitText, textX, y);

                y += textHeight + 2;
            });
            return y;
        }

        // Render Activity Blocks
        if (bodyData.generalActivity || bodyData.locationActivities.length > 0) {
            const mainTitle = 'Project Activities:';
            doc.setFontSize(13); doc.setFont('times', 'bold');
            const mainTitleDims = doc.getTextDimensions(mainTitle);
            if (yPos + mainTitleDims.h + 2 > maxYPos) {
                drawPageBorder(doc); doc.addPage(); pageNum++; yPos = drawDfrHeader(doc);
            }
            doc.text(mainTitle, contentMargin, yPos);
            yPos += mainTitleDims.h + 2;

            if (bodyData.generalActivity && bodyData.generalActivity.trim()) {
                yPos = renderTextWithBullets(bodyData.generalActivity, yPos);
            }

            bodyData.locationActivities.forEach(block => {
                if (!block.activities || !block.activities.trim()) return;
                doc.setFontSize(12); doc.setFont('times', 'bold');
                const subTitle = `Location: ${block.location || 'N/A'}`;
                const subTitleHeight = doc.getTextDimensions(subTitle).h + 2;
                if (yPos + subTitleHeight > maxYPos) {
                    drawPageBorder(doc); doc.addPage(); pageNum++; yPos = drawDfrHeader(doc);
                }
                doc.text(subTitle, contentMargin, yPos);
                yPos += subTitleHeight;
                yPos = renderTextWithBullets(block.activities, yPos);
                yPos += 2;
            });
        }

        const textSections = [
            { title: 'Communication:', content: bodyData.communication },
            { title: 'Weather and Ground Conditions:', content: bodyData.weatherAndGroundConditions },
            { title: 'Environmental Protection Measures & Mitigation:', content: bodyData.environmentalProtection },
            { title: 'Wildlife Observations:', content: bodyData.wildlifeObservations },
            { title: 'Further Restoration or Monitoring Required:', content: bodyData.furtherRestoration },
        ];

        textSections.forEach(({ title, content }) => {
            if (!content || !content.trim()) return;
            const spaceBeforeSection = 4;
            doc.setFontSize(13); doc.setFont('times', 'bold');
            const titleHeight = doc.getTextDimensions(title).h + 2;
            if (yPos + spaceBeforeSection + titleHeight > maxYPos) {
                drawPageBorder(doc); doc.addPage(); pageNum++; yPos = drawDfrHeader(doc);
            } else {
                yPos += spaceBeforeSection;
            }
            doc.setFontSize(13); doc.setFont('times', 'bold');
            doc.text(title, contentMargin, yPos);
            yPos += titleHeight;
            yPos = renderTextWithBullets(content, yPos);
        });


        drawPageBorder(doc);
        
        const sitePhotos = photosData.filter(p => !p.isMap && p.imageUrl);
        const mapPhotosData = photosData.filter(p => p.isMap && p.imageUrl);
        
        const calculatePhotoEntryHeight = async (docInstance: any, photo: PhotoData): Promise<number> => {
            const gap = 5;
            const availableWidth = contentWidth - gap;
            const textBlockWidth = availableWidth * 0.35;
            const imageBlockWidth = availableWidth * 0.65;
            
            docInstance.setFontSize(12);
            let textHeight = 0;
            const textMetrics = docInstance.getTextDimensions('Photo');
            textHeight += textMetrics.h * 0.75;
            
            const measureField = (label: string, value: string) => {
                const labelText = `${label}:`;
                docInstance.setFont('times', 'bold');
                const labelWidth = docInstance.getTextWidth(labelText);
                docInstance.setFont('times', 'normal');
                const valueMaxWidth = textBlockWidth - labelWidth - 2;
                const valueLines = docInstance.splitTextToSize(value || ' ', valueMaxWidth);
                return docInstance.getTextDimensions(valueLines).h + 1.5;
            };

            textHeight += measureField(photo.isMap ? "Map" : "Photo", photo.photoNumber);
            if (!photo.isMap) textHeight += measureField("Direction", photo.direction || 'N/A');
            textHeight += measureField("Date", photo.date);
            textHeight += measureField("Location", photo.location);
            textHeight += 5;
            const descLines = docInstance.splitTextToSize(photo.description || ' ', textBlockWidth);
            textHeight += docInstance.getTextDimensions(descLines).h;

            let imageH = 0;
            if (photo.imageUrl) {
                try {
                    const { width, height } = await getImageDimensions(photo.imageUrl);
                    imageH = height * (imageBlockWidth / width);
                } catch (e) {
                    console.error("Could not load image for height calculation", e);
                }
            }
            return Math.max(textHeight, imageH);
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
            const descLines = docInstance.splitTextToSize(photo.description || ' ', textBlockWidth);
            docInstance.text(descLines, xStart, textY);
        };
        
        const drawPhotoEntry = async (docInstance: any, photo: PhotoData, yStart: number) => {
            const gap = 5;
            const availableWidth = contentWidth - gap;
            const textBlockWidth = availableWidth * 0.35;
            const imageBlockWidth = availableWidth * 0.65;
            const imageX = contentMargin + textBlockWidth + gap;
            
            drawPhotoEntryText(docInstance, photo, contentMargin, yStart, textBlockWidth);

            if (photo.imageUrl) {
                const { width, height } = await getImageDimensions(photo.imageUrl);
                const scaledHeight = height * (imageBlockWidth / width);
                docInstance.addImage(photo.imageUrl, 'JPEG', imageX, yStart, imageBlockWidth, scaledHeight);
            }
        };

        if (sitePhotos.length > 0) {
            const entryHeights = await Promise.all(sitePhotos.map(p => calculatePhotoEntryHeight(doc, p)));
            const dummyDoc = new jsPDF();
            const yAfterHeader = drawPhotoPageHeader(dummyDoc);
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
                
                let yPos = drawPhotoPageHeader(doc);
                const photosOnPage = group.map(i => sitePhotos[i]);
                const heightsOnPage = group.map(i => entryHeights[i]);
                const availableHeight = maxYPos - yPos;

                if (photosOnPage.length === 1) {
                    await drawPhotoEntry(doc, photosOnPage[0], yPos);
                } else {
                    const totalContentHeight = heightsOnPage.reduce((sum, h) => sum + h, 0);
                    const tightGap = 4; // The smaller gap above photos
                    
                    const totalRemainingSpace = availableHeight - totalContentHeight - (tightGap * 2);
                    const largeGap = totalRemainingSpace > 0 ? totalRemainingSpace / 2 : 2;

                    // Position first photo
                    yPos += tightGap;
                    await drawPhotoEntry(doc, photosOnPage[0], yPos);
                    yPos += heightsOnPage[0];

                    // Position separator line
                    yPos += largeGap;
                    doc.setDrawColor(0, 125, 140); // Teal
                    doc.setLineWidth(0.5);
                    doc.line(borderMargin, yPos, pageWidth - borderMargin, yPos);
                    
                    // Position second photo
                    yPos += tightGap;
                    await drawPhotoEntry(doc, photosOnPage[1], yPos);
                }
                drawPageBorder(doc);
            }
        }
        
        const calculateMapTextHeight = (docInstance: any, photo: PhotoData, textBlockWidth: number): number => {
            let height = 0;
            docInstance.setFontSize(12);
            docInstance.setFont('times', 'normal');
            
            const textMetrics = docInstance.getTextDimensions('Photo');
            height += textMetrics.h * 0.75; // ascent

            const measureField = (label: string, value: string) => {
                docInstance.setFont('times', 'bold');
                const labelText = `${label}:`;
                const labelWidth = docInstance.getTextWidth(labelText);
                docInstance.setFont('times', 'normal');
                const valueMaxWidth = textBlockWidth - labelWidth - 2;
                const valueLines = docInstance.splitTextToSize(value || ' ', valueMaxWidth);
                return docInstance.getTextDimensions(valueLines).h + 1.5;
            };
            
            height += measureField("Map", photo.photoNumber);
            height += measureField("Date", photo.date);
            height += measureField("Location", photo.location);

            // Replicate drawing logic's height calculation for description part
            height += 5; // The gap from drawPhotoEntryText
            const descLines = docInstance.splitTextToSize(photo.description || ' ', textBlockWidth);
            height += docInstance.getTextDimensions(descLines).h;

            return height;
        };

        if (mapPhotosData.length > 0) {
            for (const map of mapPhotosData) {
                doc.addPage(); 
                pageNum++;
        
                let yPos = drawPhotoPageHeader(doc);
                const footerAndGapHeight = 25;
                const textBlockHeight = calculateMapTextHeight(doc, map, contentWidth);
                const availableHeightForImage = pageHeight - yPos - footerAndGapHeight - textBlockHeight;
                const availableWidthForImage = contentWidth;
        
                let yPosAfterImage = yPos;
        
                if (map.imageUrl) {
                    const { width: imgW, height: imgH } = await getImageDimensions(map.imageUrl);
                    
                    const ratio = Math.min(availableWidthForImage / imgW, availableHeightForImage / imgH);
                    const drawWidth = imgW * ratio;
                    const drawHeight = imgH * ratio;
                    
                    const drawX = contentMargin + (availableWidthForImage - drawWidth) / 2;
                    
                    doc.addImage(map.imageUrl, 'JPEG', drawX, yPos, drawWidth, drawHeight);
                    yPosAfterImage = yPos + drawHeight + 8; // Add a gap
                }
                
                drawPhotoEntryText(doc, map, contentMargin, yPosAfterImage, contentWidth);
                
                drawPageBorder(doc);
            }
        }

        const sanitize = (name: string) => name.replace(/[^a-z0-9_]/gi, '-').toLowerCase();
        const formattedFilenameDate = formatDateForFilename(headerData.date);
        const sanitizedProjectName = sanitize(headerData.projectName);
        const filename = `${sanitizedProjectName || 'project'}_DFR_${formattedFilenameDate}.pdf`;
        
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(10);
            doc.setFont('times', 'normal');
            doc.setTextColor(0, 0, 0);
            const footerTextY = pageHeight - borderMargin + 4;
            doc.text(`Page ${i} of ${totalPages}`, pageWidth - borderMargin, footerTextY, { align: 'right' });
        }
        
        const pdfBlob = doc.output('blob');
        const pdfUrl = URL.createObjectURL(pdfBlob);
        setPdfPreview({ url: pdfUrl, filename });
    };

    const getHeaderErrors = (): Set<keyof DfrHeaderData> => {
        const headerErrors = new Set<keyof DfrHeaderData>();
        errors.forEach(errorKey => {
            if (!errorKey.startsWith('photo-') && Object.keys(headerData).includes(errorKey)) {
                headerErrors.add(errorKey as keyof DfrHeaderData);
            }
        });
        return headerErrors;
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
                    <div className="flex flex-wrap justify-end gap-2">
                        <button onClick={handleOpenProject} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200">
                            <FolderOpenIcon /> <span>Open Project</span>
                        </button>
                         <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileSelected}
                            style={{ display: 'none' }}
                            accept=".dfr"
                        />
                        <button onClick={handleSaveProject} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200">
                            <SaveIcon /> <span>Save Project</span>
                        </button>
                        {/* @ts-ignore */}
                        {!window.electronAPI && (
                            <button onClick={handleDownloadPhotos} className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200">
                                <FolderArrowDownIcon /> <span>Download Photos</span>
                            </button>
                        )}
                        <button onClick={handleSavePdf} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200">
                            <DownloadIcon /> <span>Save to PDF</span>
                        </button>
                    </div>
                </div>
                
                <div className="main-content space-y-8">
                    <DfrHeader data={headerData} onDataChange={handleHeaderChange} errors={getHeaderErrors()} placeholders={dfrPlaceholders.header} />
                    
                    <Section title="Project Activities">
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="block text-sm font-medium text-gray-700">General Activity</label>
                                <button onClick={() => toggleComment('generalActivity')} title="Toggle comment" className={`p-1 rounded-full ${openComments.has('generalActivity') ? 'bg-yellow-200 text-yellow-800' : 'text-gray-400 hover:text-gray-600'}`}>
                                    <ChatBubbleLeftIcon className="h-5 w-5" />
                                </button>
                            </div>
                            {openComments.has('generalActivity') && (
                                <textarea value={bodyData.comments?.generalActivity || ''} onChange={(e) => handleCommentChange('generalActivity', e.target.value)} placeholder="Add a comment for editing purposes..." rows={2} className="block w-full p-2 border border-yellow-300 bg-yellow-50 rounded-md shadow-sm focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition mb-2" />
                            )}
                            <BulletPointEditor label="" value={bodyData.generalActivity} onChange={handleGeneralActivityChange} rows={15} placeholder={dfrPlaceholders.body.generalActivity} isInvalid={errors.has('generalActivity')} />
                        </div>
                         <div className="space-y-4">
                            {bodyData.locationActivities.map((block, index) => (
                                <LocationBlockEntry 
                                    key={block.id}
                                    data={block}
                                    onDataChange={updateLocationActivity}
                                    onRemove={removeLocationActivity}
                                    onMove={moveLocationActivity}
                                    isFirst={index === 0}
                                    isLast={index === bodyData.locationActivities.length - 1}
                                />
                            ))}
                        </div>
                        <div className="text-center">
                            <button onClick={addLocationActivity} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200">
                                <PlusIcon />
                                <span>Add Location-Specific Activity</span>
                            </button>
                        </div>
                    </Section>

                    <Section title="Communications & Conditions">
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="block text-sm font-medium text-gray-700">Communication</label>
                                <button onClick={() => toggleComment('communication')} title="Toggle comment" className={`p-1 rounded-full ${openComments.has('communication') ? 'bg-yellow-200 text-yellow-800' : 'text-gray-400 hover:text-gray-600'}`}>
                                    <ChatBubbleLeftIcon className="h-5 w-5" />
                                </button>
                            </div>
                            {openComments.has('communication') && (
                                <textarea value={bodyData.comments?.communication || ''} onChange={(e) => handleCommentChange('communication', e.target.value)} placeholder="Add a comment for editing purposes..." rows={2} className="block w-full p-2 border border-yellow-300 bg-yellow-50 rounded-md shadow-sm focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition mb-2" />
                            )}
                            <BulletPointEditor label="" value={bodyData.communication} onChange={v => handleBodyDataChange('communication', v)} rows={3} placeholder={dfrPlaceholders.body.communication} isInvalid={errors.has('communication')}/>
                        </div>
                        <div>
                             <div className="flex items-center justify-between mb-1">
                                <label className="block text-sm font-medium text-gray-700">Weather and Ground Conditions</label>
                                <button onClick={() => toggleComment('weatherAndGroundConditions')} title="Toggle comment" className={`p-1 rounded-full ${openComments.has('weatherAndGroundConditions') ? 'bg-yellow-200 text-yellow-800' : 'text-gray-400 hover:text-gray-600'}`}>
                                    <ChatBubbleLeftIcon className="h-5 w-5" />
                                </button>
                            </div>
                            {openComments.has('weatherAndGroundConditions') && (
                                <textarea value={bodyData.comments?.weatherAndGroundConditions || ''} onChange={(e) => handleCommentChange('weatherAndGroundConditions', e.target.value)} placeholder="Add a comment for editing purposes..." rows={2} className="block w-full p-2 border border-yellow-300 bg-yellow-50 rounded-md shadow-sm focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition mb-2" />
                            )}
                            <BulletPointEditor label="" value={bodyData.weatherAndGroundConditions} onChange={v => handleBodyDataChange('weatherAndGroundConditions', v)} rows={3} placeholder={dfrPlaceholders.body.weatherAndGroundConditions} isInvalid={errors.has('weatherAndGroundConditions')}/>
                        </div>
                    </Section>
                    
                    <Section title="Environmental & Wildlife">
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="block text-sm font-medium text-gray-700">Environmental Protection Measures & Mitigation</label>
                                <button onClick={() => toggleComment('environmentalProtection')} title="Toggle comment" className={`p-1 rounded-full ${openComments.has('environmentalProtection') ? 'bg-yellow-200 text-yellow-800' : 'text-gray-400 hover:text-gray-600'}`}>
                                    <ChatBubbleLeftIcon className="h-5 w-5" />
                                </button>
                            </div>
                            {openComments.has('environmentalProtection') && (
                                <textarea value={bodyData.comments?.environmentalProtection || ''} onChange={(e) => handleCommentChange('environmentalProtection', e.target.value)} placeholder="Add a comment for editing purposes..." rows={2} className="block w-full p-2 border border-yellow-300 bg-yellow-50 rounded-md shadow-sm focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition mb-2" />
                            )}
                            <BulletPointEditor label="" value={bodyData.environmentalProtection} onChange={v => handleBodyDataChange('environmentalProtection', v)} rows={7} placeholder={dfrPlaceholders.body.environmentalProtection} isInvalid={errors.has('environmentalProtection')} />
                        </div>
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="block text-sm font-medium text-gray-700">Wildlife Observations</label>
                                <button onClick={() => toggleComment('wildlifeObservations')} title="Toggle comment" className={`p-1 rounded-full ${openComments.has('wildlifeObservations') ? 'bg-yellow-200 text-yellow-800' : 'text-gray-400 hover:text-gray-600'}`}>
                                    <ChatBubbleLeftIcon className="h-5 w-5" />
                                </button>
                            </div>
                            {openComments.has('wildlifeObservations') && (
                                <textarea value={bodyData.comments?.wildlifeObservations || ''} onChange={(e) => handleCommentChange('wildlifeObservations', e.target.value)} placeholder="Add a comment for editing purposes..." rows={2} className="block w-full p-2 border border-yellow-300 bg-yellow-50 rounded-md shadow-sm focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition mb-2" />
                            )}
                            <BulletPointEditor label="" value={bodyData.wildlifeObservations} onChange={v => handleBodyDataChange('wildlifeObservations', v)} rows={3} placeholder={dfrPlaceholders.body.wildlifeObservations} isInvalid={errors.has('wildlifeObservations')}/>
                        </div>
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="block text-sm font-medium text-gray-700">Further Restoration or Monitoring Required</label>
                                <button onClick={() => toggleComment('furtherRestoration')} title="Toggle comment" className={`p-1 rounded-full ${openComments.has('furtherRestoration') ? 'bg-yellow-200 text-yellow-800' : 'text-gray-400 hover:text-gray-600'}`}>
                                    <ChatBubbleLeftIcon className="h-5 w-5" />
                                </button>
                            </div>
                            {openComments.has('furtherRestoration') && (
                                <textarea value={bodyData.comments?.furtherRestoration || ''} onChange={(e) => handleCommentChange('furtherRestoration', e.target.value)} placeholder="Add a comment for editing purposes..." rows={2} className="block w-full p-2 border border-yellow-300 bg-yellow-50 rounded-md shadow-sm focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition mb-2" />
                            )}
                            <BulletPointEditor label="" value={bodyData.furtherRestoration} onChange={v => handleBodyDataChange('furtherRestoration', v)} rows={3} placeholder={dfrPlaceholders.body.furtherRestoration} isInvalid={errors.has('furtherRestoration')} />
                        </div>
                    </Section>

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
                                        <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                            <div className="w-full border-t-2 border-gray-300"></div>
                                        </div>
                                        <div className="relative">
                                            <button
                                                onClick={() => addPhoto(false, index)}
                                                className="bg-white hover:bg-gray-100 text-[#007D8C] font-bold py-2 px-4 rounded-full border border-gray-300 inline-flex items-center gap-2 transition duration-200 shadow-sm"
                                            >
                                                <PlusIcon />
                                                <span>Add Photo Here</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="mt-8 flex justify-center gap-4">
                        <button
                            onClick={() => addPhoto(false)}
                            className="bg-[#007D8C] hover:bg-[#006b7a] text-white font-bold py-3 px-6 rounded-lg shadow-md inline-flex items-center gap-2 transition duration-200 text-lg"
                        >
                            <PlusIcon />
                            <span>Add Photo</span>
                        </button>
                         <button
                            onClick={() => addPhoto(true)}
                            className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-lg shadow-md inline-flex items-center gap-2 transition duration-200 text-lg"
                        >
                            <PlusIcon />
                            <span>Add Map</span>
                        </button>
                    </div>
                </div>
                {photosData.length > 0 && <div className="border-t-4 border-[#007D8C] my-8" />}
                <footer className="text-center text-gray-500 text-sm py-4">
                    X-TES Digital Reporting v1.0.9
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
                        <button
                            onClick={() => setShowNoInternetModal(false)}
                            className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-700"
                            aria-label="Close"
                        >
                            <CloseIcon className="h-6 w-6" />
                        </button>
                        <h3 className="text-2xl font-bold mb-2 text-gray-800">No Internet Connection</h3>
                        <p className="text-gray-600">
                            An internet connection is required to save the PDF. Please connect to the internet and try again.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

// FIX: Add default export for the DfrStandard component.
export default DfrStandard;