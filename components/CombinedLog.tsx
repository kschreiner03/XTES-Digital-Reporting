import React, { useState, useEffect, useRef, useCallback } from 'react';
import Header from './Header';
import PhotoEntry from './PhotoEntry';
import type { HeaderData, PhotoData } from '../types';
import { PlusIcon, DownloadIcon, SaveIcon, FolderOpenIcon, CloseIcon, ArrowLeftIcon, FolderArrowDownIcon, DocumentDuplicateIcon, ClipboardDocumentListIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon } from './icons';
import { AppType } from '../App';
import { storeImage, retrieveImage, deleteImage, storeProject, deleteProject, retrieveProject } from './db';
import { SpecialCharacterPalette } from './SpecialCharacterPalette';
import ImageModal from './ImageModal';
import ActionStatusModal from './ActionStatusModal';
import { RecentProject } from './LandingPage';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import SafeImage, { getAssetUrl } from './SafeImage';

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

const addRecentProject = async (projectData: any, projectInfo: { type: AppType; name: string; projectNumber: string; }): Promise<number> => {
    const timestamp = Date.now();
    
    try {
        await storeProject(timestamp, projectData);
    } catch (e) {
        console.error("Failed to save project to IndexedDB:", e);
        return timestamp;
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
    }
    return timestamp;
};

// --- End Utility ---

// Helper function to get image dimensions asynchronously
const getImageDimensions = (url: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = (err) => reject(err);
        img.src = url;
    });
};

const formatDateForRecentProject = (dateString: string): string => {
    if (!dateString) return '';
    try {
        const tempDate = new Date(dateString);
        if (isNaN(tempDate.getTime())) {
            return dateString; // Return original if invalid
        }
        const year = tempDate.getFullYear();
        const month = tempDate.getMonth();
        const day = tempDate.getDate();
        const utcDate = new Date(Date.UTC(year, month, day));
        
        const formattedYear = utcDate.getUTCFullYear();
        const formattedMonth = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
        const formattedDay = String(utcDate.getUTCDate()).padStart(2, '0');

        return `${formattedYear}/${formattedMonth}/${formattedDay}`;
    } catch (e) {
        return dateString;
    }
};

const PdfPreviewModal: React.FC<{ url: string; filename: string; onClose: () => void; pdfBlob?: Blob; }> = ({ url, filename, onClose, pdfBlob }) => {
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

    const handleDownload = async () => {
        // @ts-ignore
        if (window.electronAPI && window.electronAPI.savePdf) {
            try {
                let arrayBuffer;
                if (pdfBlob) {
                    arrayBuffer = await pdfBlob.arrayBuffer();
                } else {
                    const response = await fetch(url);
                    const blob = await response.blob();
                    arrayBuffer = await blob.arrayBuffer();
                }
                
                // @ts-ignore
                const result = await window.electronAPI.savePdf(arrayBuffer, filename);
                
                if (result.success) {
                    alert('PDF saved successfully!');
                } else if (result.error) {
                    alert(`Failed to save PDF: ${result.error}`);
                }
            } catch (e) {
                console.error("Error saving PDF via Electron:", e);
                alert("An error occurred while saving the PDF.");
            }
        } else {
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex flex-col items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full h-full flex flex-col overflow-hidden transition-colors duration-200">
                <div className="flex justify-between items-center p-4 border-b bg-gray-50 dark:bg-gray-700 dark:border-gray-600">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-white">PDF Preview</h3>
                    <div className="flex items-center gap-4">
                        <button onClick={handleDownload} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200">
                            <DownloadIcon />
                            <span>Download PDF</span>
                        </button>
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white transition-colors" aria-label="Close preview">
                            <CloseIcon className="h-8 w-8" />
                        </button>
                    </div>
                </div>
                <div className="flex-grow bg-gray-200 dark:bg-gray-900 relative">
                    <object data={url} type="application/pdf" className="w-full h-full">
                        <div className="flex flex-col items-center justify-center h-full bg-gray-100 dark:bg-gray-800 p-8 text-center text-gray-700 dark:text-gray-300">
                            <p className="mb-4 text-lg font-semibold">It appears your browser cannot preview PDFs directly.</p>
                            <p className="mb-6">You can download the file to view it instead.</p>
                            <button
                                onClick={handleDownload}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200"
                            >
                                <DownloadIcon />
                                <span>Download PDF</span>
                            </button>
                        </div>
                    </object>
                </div>
            </div>
        </div>
    );
};

const ImportProjectsModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onImport: (selectedProjects: RecentProject[]) => void;
    currentProjectTimestamp: number | null;
}> = ({ isOpen, onClose, onImport, currentProjectTimestamp }) => {
    const [allRecentProjects, setAllRecentProjects] = useState<RecentProject[]>([]);
    const [selectedTimestamps, setSelectedTimestamps] = useState<Set<number>>(new Set());

    useEffect(() => {
        if (isOpen) {
            const projects = (localStorage.getItem(RECENT_PROJECTS_KEY) ? JSON.parse(localStorage.getItem(RECENT_PROJECTS_KEY)!) : []) as RecentProject[];
            const compatibleProjects = projects.filter(p =>
                (p.type === 'photoLog' || p.type === 'dfrStandard' || p.type === 'dfrSaskpower') &&
                p.timestamp !== currentProjectTimestamp
            );
            setAllRecentProjects(compatibleProjects);
            setSelectedTimestamps(new Set());
        }
    }, [isOpen, currentProjectTimestamp]);

    const handleToggleSelection = (timestamp: number) => {
        setSelectedTimestamps(prev => {
            const newSet = new Set(prev);
            if (newSet.has(timestamp)) {
                newSet.delete(timestamp);
            } else {
                newSet.add(timestamp);
            }
            return newSet;
        });
    };

    const handleConfirmImport = () => {
        const projectsToImport = allRecentProjects.filter(p => selectedTimestamps.has(p.timestamp));
        onImport(projectsToImport);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col transition-colors duration-200">
                <div className="flex justify-between items-center border-b dark:border-gray-700 pb-3 mb-4">
                    <h2 className="text-xl font-bold text-gray-800 dark:text-white">Import Photos from Projects</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"><CloseIcon /></button>
                </div>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                    Select projects to import photos from.
                </p>
                <div className="flex-grow overflow-y-auto border dark:border-gray-700 rounded-md p-2 bg-gray-50 dark:bg-gray-900">
                    {allRecentProjects.length > 0 ? (
                        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                            {allRecentProjects.map(p => (
                                <li key={p.timestamp} className="p-3 flex items-center">
                                    <input
                                        type="checkbox"
                                        id={`proj-${p.timestamp}`}
                                        checked={selectedTimestamps.has(p.timestamp)}
                                        onChange={() => handleToggleSelection(p.timestamp)}
                                        className="h-5 w-5 rounded border-gray-300 text-[#007D8C] focus:ring-[#007D8C]"
                                    />
                                    <label htmlFor={`proj-${p.timestamp}`} className="ml-3 flex-grow cursor-pointer">
                                        <p className="font-semibold text-gray-800 dark:text-gray-200">{p.name}</p>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">Project #: {p.projectNumber} | Last updated: {new Date(p.timestamp).toLocaleDateString()}</p>
                                    </label>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                            <p>No compatible recent projects found.</p>
                            <p className="text-sm mt-2">Create and save some DFRs or Photo Logs to see them here.</p>
                        </div>
                    )}
                </div>
                <div className="mt-6 flex justify-end gap-3">
                    <button onClick={onClose} className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white text-gray-800 font-bold py-2 px-4 rounded-lg">Cancel</button>
                    <button onClick={handleConfirmImport} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg" disabled={selectedTimestamps.size === 0}>
                        Import ({selectedTimestamps.size})
                    </button>
                </div>
            </div>
        </div>
    );
};


interface CombinedLogProps {
  onBack: () => void;
  initialData?: any;
}

const CombinedLog: React.FC<CombinedLogProps> = ({ onBack, initialData }) => {
    const [headerData, setHeaderData] = useState<HeaderData>({
        proponent: '',
        projectName: '',
        location: '',
        date: '',
        projectNumber: '',
    });

    const [photosData, setPhotosData] = useState<PhotoData[]>([]);
    const [projectTimestamp, setProjectTimestamp] = useState<number | null>(null);
    
    const [errors, setErrors] = useState(new Set<string>());
    const [showUnsupportedFileModal, setShowUnsupportedFileModal] = useState<boolean>(false);
    const [showValidationErrorModal, setShowValidationErrorModal] = useState<boolean>(false);
    const [showNoInternetModal, setShowNoInternetModal] = useState<boolean>(false);
    const [enlargedImageUrl, setEnlargedImageUrl] = useState<string | null>(null);
    const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string; blob?: Blob } | null>(null);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const importFileInputRef = useRef<HTMLInputElement>(null);
    const isDownloadingRef = useRef(false);

    // Define this helper function first as it is used in parseAndLoadProject
    const prepareStateForRecentProjectStorage = async (headerData: HeaderData, photosData: PhotoData[]) => {
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
        return { headerData, photosData: photosForStorage };
    };

    const parseAndLoadProject = async (fileContent: string) => {
        try {
            const projectData = JSON.parse(fileContent);
            const { headerData: loadedHeader, photosData: loadedPhotos } = projectData;

            if (loadedHeader && loadedPhotos && Array.isArray(loadedPhotos)) {
                setHeaderData(loadedHeader);

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

                const formattedDate = formatDateForRecentProject(loadedHeader.date);
                const dateSuffix = formattedDate ? ` - ${formattedDate}` : '';
                const projectName = `${loadedHeader.projectName || 'Untitled Combine Logs'}${dateSuffix}`;

                const stateForRecent = await prepareStateForRecentProjectStorage(loadedHeader, hydratedPhotos);
                const newTimestamp = await addRecentProject(stateForRecent, {
                    type: 'combinedLog',
                    name: projectName,
                    projectNumber: loadedHeader.projectNumber,
                });
                setProjectTimestamp(newTimestamp);
            } else {
                alert('Invalid project file format.');
            }
        } catch (err) {
            alert('Error parsing project file. Ensure it is a valid JSON file.');
            console.error(err);
        }
    };


    useEffect(() => {
        const loadInitialData = async () => {
            if (initialData) {
                setHeaderData(initialData.headerData || { proponent: '', projectName: '', location: '', date: '', projectNumber: '' });

                if (initialData.photosData && Array.isArray(initialData.photosData)) {
                    const hydratedPhotos = await Promise.all(
                        initialData.photosData.map(async (photo: PhotoData) => {
                            if (photo.imageId && !photo.imageUrl) {
                                const imageUrl = await retrieveImage(photo.imageId);
                                return { ...photo, imageUrl: imageUrl || null };
                            }
                            return photo;
                        })
                    );
                    setPhotosData(hydratedPhotos);
                } else {
                    setPhotosData(initialData.photosData || []);
                }

                if (initialData.timestamp) {
                    setProjectTimestamp(initialData.timestamp);
                }
            } else {
                // Load defaults for new projects
                try {
                    const settings = JSON.parse(localStorage.getItem('xtec_general_settings') || '{}');
                    if (settings.defaultProponent) {
                         setHeaderData(prev => ({ ...prev, proponent: settings.defaultProponent }));
                    }
                } catch (e) {
                    console.error("Failed to load settings", e);
                }
            }
        };
        loadInitialData();
    }, [initialData]);

    const handleHeaderChange = (field: keyof HeaderData, value: string) => {
        setHeaderData(prev => ({ ...prev, [field]: value }));
    };

    const handlePhotoDataChange = (id: number, field: keyof Omit<PhotoData, 'id' | 'imageUrl' | 'imageId'>, value: string) => {
        setPhotosData(prev => prev.map(photo => photo.id === id ? { ...photo, [field]: value } : photo));
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
    
                const targetAspectRatio = 4 / 3;
                const originalAspectRatio = img.width / img.height;
    
                const canvasWidth = 1024;
                const canvasHeight = 768;
    
                canvas.width = canvasWidth;
                canvas.height = canvasHeight;
    
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
    
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
        return photos.map((photo, index) => ({ ...photo, photoNumber: String(index + 1) }));
    };

    const addPhoto = (insertAtIndex?: number) => {
        const newId = photosData.length > 0 ? Math.max(...photosData.map(p => p.id)) + 1 : 1;
        const newPhoto: PhotoData = {
            id: newId,
            photoNumber: '', 
            date: headerData.date || '',
            location: '',
            description: '',
            imageUrl: null,
            direction: '',
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

    const handleImportProjects = async (selectedProjects: RecentProject[]) => {
        setIsImportModalOpen(false);
        setStatusMessage('Importing photos...');
        setShowStatusModal(true);

        try {
            const newPhotos: PhotoData[] = [];
            for (const proj of selectedProjects) {
                const projectData = await retrieveProject(proj.timestamp);
                if (projectData && projectData.photosData) {
                    const photos = projectData.photosData as PhotoData[];
                    for (const p of photos) {
                        let imageUrl = p.imageUrl;
                        if (!imageUrl && p.imageId) {
                            imageUrl = await retrieveImage(p.imageId);
                        }

                        if (imageUrl) {
                             newPhotos.push({
                                ...p,
                                id: 0, // temp ID, will be reassigned
                                imageId: undefined, // Clear old image ID so a new one is generated on save
                                imageUrl: imageUrl
                            });
                        }
                    }
                }
            }

            setPhotosData(prev => {
                let nextId = prev.length > 0 ? Math.max(...prev.map(item => item.id)) + 1 : 1;
                const processedNewPhotos = newPhotos.map(p => ({
                    ...p,
                    id: nextId++,
                }));
                const combined = [...prev, ...processedNewPhotos];
                return renumberPhotos(combined);
            });
             
        } catch (e) {
            console.error("Import failed", e);
            alert("Failed to import some projects.");
        } finally {
            setShowStatusModal(false);
        }
    };

    // New Function to handle file import from filesystem
    const handleImportFromFiles = async () => {
        // @ts-ignore
        if (window.electronAPI && window.electronAPI.loadMultipleProjects) {
             // @ts-ignore
            const result = await window.electronAPI.loadMultipleProjects();
            if (result.success && result.data) {
                await processImportedFiles(result.data);
            }
        } else {
            importFileInputRef.current?.click();
        }
    };

    const handleImportFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const fileContents: string[] = [];
        for (let i = 0; i < files.length; i++) {
            const text = await files[i].text();
            fileContents.push(text);
        }
        
        await processImportedFiles(fileContents);
        
        if (event.target) {
            event.target.value = '';
        }
    };

    const processImportedFiles = async (fileContents: string[]) => {
        setStatusMessage('Importing photos from files...');
        setShowStatusModal(true);
        
        try {
            const newPhotos: PhotoData[] = [];
            for (const content of fileContents) {
                try {
                    const projectData = JSON.parse(content);
                    if (projectData && projectData.photosData && Array.isArray(projectData.photosData)) {
                         const photos = projectData.photosData as PhotoData[];
                         for (const p of photos) {
                            let imageUrl = p.imageUrl;
                            if (!imageUrl && p.imageId) {
                                // Try to retrieve from DB if it exists there (might happen if imported from local file corresponding to recent project)
                                const storedImg = await retrieveImage(p.imageId);
                                if (storedImg) imageUrl = storedImg;
                            }

                            if (imageUrl) {
                                 newPhotos.push({
                                    ...p,
                                    id: 0, // temp
                                    imageId: undefined, 
                                    imageUrl: imageUrl
                                });
                            }
                         }
                    }
                } catch (e) {
                    console.error("Error parsing a file", e);
                }
            }

            if (newPhotos.length > 0) {
                setPhotosData(prev => {
                    let nextId = prev.length > 0 ? Math.max(...prev.map(item => item.id)) + 1 : 1;
                    const processedNewPhotos = newPhotos.map(p => ({
                        ...p,
                        id: nextId++,
                    }));
                    const combined = [...prev, ...processedNewPhotos];
                    return renumberPhotos(combined);
                });
            } else {
                alert("No photos found in selected files. Ensure the files are valid project files with embedded images.");
            }

        } catch (e) {
            console.error("Import process failed", e);
            alert("An error occurred while importing files.");
        } finally {
            setShowStatusModal(false);
        }
    };

    const validateForm = (): boolean => {
        const newErrors = new Set<string>();
        (Object.keys(headerData) as Array<keyof HeaderData>).forEach(key => {
            if (!headerData[key]) {
                newErrors.add(key);
            }
        });
        photosData.forEach(photo => {
            const prefix = `photo-${photo.id}-`;
            if (!photo.date) newErrors.add(`${prefix}date`);
            if (!photo.location) newErrors.add(`${prefix}location`);
            if (!photo.description) newErrors.add(`${prefix}description`);
            if (!photo.imageUrl) newErrors.add(`${prefix}imageUrl`);
        });

        setErrors(newErrors);
        if (newErrors.size > 0) {
            setShowValidationErrorModal(true);
            return false;
        }
        return true;
    };

    const handleSaveProject = async () => {
        const stateForRecentProjects = await prepareStateForRecentProjectStorage(headerData, photosData);
        
        const formattedDate = formatDateForRecentProject(headerData.date);
        const dateSuffix = formattedDate ? ` - ${formattedDate}` : '';
        const projectName = `${headerData.projectName || 'Untitled Combine Logs'}${dateSuffix}`;

        const newTimestamp = await addRecentProject(stateForRecentProjects, {
            type: 'combinedLog',
            name: projectName,
            projectNumber: headerData.projectNumber,
        });
        setProjectTimestamp(newTimestamp);
        
        const photosForExport = photosData.map(({ imageId, ...photo }) => photo);
        const stateForFileExport = { headerData, photosData: photosForExport };

        const sanitize = (name: string) => name.replace(/[^a-z0-9_]/gi, '-').toLowerCase();
        const filename = `${sanitize(headerData.projectNumber) || 'project'}_${sanitize(headerData.projectName) || 'combinedlog'}.clog`;

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

    const addSafeLogo = async (docInstance: any, x: number, y: number, w: number, h: number) => {
        const logoUrl = await getAssetUrl("xterra-logo.jpg");
        try {
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
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error("Could not load logo:", e);
            docInstance.setFontSize(10);
            docInstance.setTextColor(0,0,0);
            docInstance.text("X-TERRA", x, y + 5);
        }
    };

    const handleSavePdf = async () => {
        if (!validateForm()) return;
        const stateForRecentProjects = await prepareStateForRecentProjectStorage(headerData, photosData);
        const formattedDate = formatDateForRecentProject(headerData.date);
        const dateSuffix = formattedDate ? ` - ${formattedDate}` : '';
        const projectName = `${headerData.projectName || 'Untitled Combine Logs'}${dateSuffix}`;

        await addRecentProject(stateForRecentProjects, {
            type: 'combinedLog',
            name: projectName,
            projectNumber: headerData.projectNumber,
        });

        // Reusing PDF generation logic from PhotoLog (since content is the same structure)
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'letter' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 10;
        const contentWidth = pageWidth - margin * 2;

        const drawHeader = async (docInstance: any) => {
            const headerStartY = margin;
            await addSafeLogo(docInstance, margin, headerStartY, 40, 10);
            
            docInstance.setFontSize(18);
            docInstance.setFont('times', 'bold');
            docInstance.setTextColor(0, 125, 140);
            docInstance.text('PHOTOGRAPHIC LOG', pageWidth / 2, headerStartY + 7, { align: 'center' });
            
            docInstance.setTextColor(0, 0, 0);
            
            const firstLineY = headerStartY + 18;
            docInstance.setLineWidth(0.5);
            docInstance.setDrawColor(0, 125, 140);
            docInstance.line(margin, firstLineY, pageWidth - margin, firstLineY);

            const col1X = margin;
            const col2X = pageWidth * 0.55;
            const col1MaxWidth = col2X - col1X - 5;
            const col2MaxWidth = pageWidth - margin - col2X;
            const fieldGap = 2;

            const drawFieldAndGetHeight = (label: string, value: string, x: number, y: number, maxWidth: number): number => {
                const valueOrDefault = value || ' '; 
                const labelText = `${label}:`;
                docInstance.setFontSize(13);
                docInstance.setFont('times', 'bold');
                const labelWidth = docInstance.getTextWidth(labelText);
                const labelHeight = docInstance.getTextDimensions(labelText).h;
                docInstance.text(labelText, x, y);
                
                docInstance.setFontSize(12);
                docInstance.setFont('times', 'normal');
                const valueX = x + labelWidth + 1;
                const valueMaxWidth = maxWidth - labelWidth - 1;
                const valueLines = docInstance.splitTextToSize(valueOrDefault, valueMaxWidth);
                const valueHeight = docInstance.getTextDimensions(valueLines).h;
                docInstance.text(valueLines, valueX, y);
                
                return Math.max(labelHeight, valueHeight);
            };
            
            const topPadding = 5;
            let yPos = firstLineY + topPadding;

            const proponentHeight = drawFieldAndGetHeight('Proponent', headerData.proponent, col1X, yPos, col1MaxWidth);
            const dateHeight = drawFieldAndGetHeight('Date', headerData.date, col2X, yPos, col2MaxWidth);
            yPos += Math.max(proponentHeight, dateHeight) + fieldGap;

            const locationHeight = drawFieldAndGetHeight('Location', headerData.location, col1X, yPos, col1MaxWidth);
            const projectNumHeight = drawFieldAndGetHeight('Project', headerData.projectNumber, col2X, yPos, col2MaxWidth);
            yPos += Math.max(locationHeight, projectNumHeight) + fieldGap;

            const projectNameHeight = drawFieldAndGetHeight('Project Name', headerData.projectName, col1X, yPos, contentWidth);
            yPos += projectNameHeight;

            const contentEndY = yPos;
            const bottomPadding = 2;
            const secondLineY = contentEndY + bottomPadding;

            docInstance.setLineWidth(0.5);
            docInstance.setDrawColor(0, 125, 140);
            docInstance.line(margin, secondLineY, pageWidth - margin, secondLineY);

            return secondLineY; 
        };

        const footerHeight = 15;
        const maxYPos = pageHeight - footerHeight;

        const drawFooterLine = (docInstance: any) => {
             const lineY = pageHeight - 12;
             docInstance.setLineWidth(0.5);
             docInstance.setDrawColor(0, 125, 140);
             docInstance.line(margin, lineY, pageWidth - margin, lineY);
        };

        const calculateEntryHeight = async (docInstance: any, photo: PhotoData) => {
            const tempDoc = new jsPDF({ format: 'letter', unit: 'mm' });
            const gap = 5;
            const availableWidth = contentWidth - gap;
            const textBlockWidth = availableWidth * 0.40;
            const imageBlockWidth = availableWidth * 0.60;
            
            let totalTextHeight = 0;

            const measureFieldHeight = (label: string, value: string, isDesc = false) => {
                if (isDesc) {
                     tempDoc.setFontSize(13);
                     let height = tempDoc.getTextDimensions(label + ':', { maxWidth: textBlockWidth }).h + 2;
                     tempDoc.setFontSize(12);
                     const valueLines = tempDoc.splitTextToSize(value || ' ', textBlockWidth);
                     height += tempDoc.getTextDimensions(valueLines).h;
                     return height;
                }
                const labelText = `${label}:`;
                tempDoc.setFontSize(13);
                const labelWidth = tempDoc.getTextWidth(labelText);
                const labelHeight = tempDoc.getTextDimensions(labelText).h;
                
                tempDoc.setFontSize(12);
                const valueMaxWidth = textBlockWidth - labelWidth - 1;
                const valueLines = tempDoc.splitTextToSize(value || ' ', valueMaxWidth);
                const valueHeight = tempDoc.getTextDimensions(valueLines).h;
                
                return Math.max(labelHeight, valueHeight) + 2;
            };

            totalTextHeight += measureFieldHeight('Photo', photo.photoNumber);
            totalTextHeight += measureFieldHeight('Direction', photo.direction || 'N/A');
            totalTextHeight += measureFieldHeight('Date', photo.date);
            totalTextHeight += measureFieldHeight('Location', photo.location);
            totalTextHeight += measureFieldHeight('Description', photo.description, true);

            let scaledHeight = 0;
            if (photo.imageUrl) {
                try {
                    const { width, height } = await getImageDimensions(photo.imageUrl);
                    scaledHeight = height * (imageBlockWidth / width);
                } catch (e) {
                    console.error("Could not load image for height calculation", e);
                }
            }
            return Math.max(totalTextHeight, scaledHeight);
        };

        const drawPhotoEntry = async (docInstance: any, photo: PhotoData, yStart: number) => {
            const gap = 5;
            const availableWidth = contentWidth - gap;
            const textBlockWidth = availableWidth * 0.40;
            const imageBlockWidth = availableWidth * 0.60;
            
            const imageX = margin + textBlockWidth + gap;
            let textY = yStart;

            const drawTextField = (label: string, value: string, isDesc = false) => {
                const valueOrDefault = value || ' ';
                
                if (isDesc) {
                    docInstance.setFontSize(13);
                    docInstance.setFont('times', 'bold');
                    docInstance.text(`${label}:`, margin, textY);
                    textY += docInstance.getTextDimensions(`${label}:`, { maxWidth: textBlockWidth }).h + 2;
                    
                    docInstance.setFontSize(12);
                    docInstance.setFont('times', 'normal');
                    const dims = docInstance.getTextDimensions(valueOrDefault, { maxWidth: textBlockWidth });
                    docInstance.text(valueOrDefault, margin, textY, { maxWidth: textBlockWidth });
                    textY += dims.h;
                    return;
                }

                const labelText = `${label}:`;
                docInstance.setFontSize(13);
                docInstance.setFont('times', 'bold');
                const labelWidth = docInstance.getTextWidth(labelText);
                const labelHeight = docInstance.getTextDimensions(labelText).h;
                docInstance.text(labelText, margin, textY);
                
                docInstance.setFontSize(12);
                docInstance.setFont('times', 'normal');
                const valueX = margin + labelWidth + 1;
                const valueMaxWidth = textBlockWidth - labelWidth - 1;
                const valueLines = docInstance.splitTextToSize(valueOrDefault, valueMaxWidth);
                const valueHeight = docInstance.getTextDimensions(valueLines).h;
                docInstance.text(valueLines, valueX, textY);
                
                textY += Math.max(labelHeight, valueHeight) + 2;
            };

            drawTextField('Photo', photo.photoNumber);
            drawTextField('Direction', photo.direction || 'N/A');
            drawTextField('Date', photo.date);
            drawTextField('Location', photo.location);
            drawTextField('Description', photo.description, true);

            const textBottom = textY;
            let scaledHeight = 0;
            let imageBottom = yStart;

            if (photo.imageUrl) {
                const { width, height } = await getImageDimensions(photo.imageUrl);
                scaledHeight = height * (imageBlockWidth / width);
                docInstance.addImage(photo.imageUrl, 'JPEG', imageX, yStart, imageBlockWidth, scaledHeight);
                imageBottom = yStart + scaledHeight;
            }
            return Math.max(textBottom, imageBottom);
        };
        
        const entryHeights = await Promise.all(photosData.map(photo => calculateEntryHeight(doc, photo)));
        const pages: number[][] = [];
        
        if (photosData.length > 0) {
            const tempDoc = new jsPDF();
            const yAfterHeader = await drawHeader(tempDoc);
            const pageContentHeight = maxYPos - yAfterHeader;
            const separatorHeight = 10;
            
            let currentPageGroup: number[] = [];
            let currentHeight = 0;

            photosData.forEach((_, i) => {
                const photoHeight = entryHeights[i];
                const spaceForSeparator = currentPageGroup.length > 0 ? separatorHeight : 0;
                const spaceNeeded = photoHeight + spaceForSeparator;

                if (currentPageGroup.length < 2 && currentHeight + spaceNeeded <= pageContentHeight) {
                    currentPageGroup.push(i);
                    currentHeight += spaceNeeded;
                } else {
                    pages.push(currentPageGroup);
                    currentPageGroup = [i];
                    currentHeight = photoHeight;
                }
            });
            pages.push(currentPageGroup);
        }
        
        for (let i = 0; i < pages.length; i++) {
            const group = pages[i];
            if (i > 0) {
                doc.addPage();
            }
            let yPos = await drawHeader(doc);
            
            const photosOnPage = group.map(i => photosData[i]);
            const heightsOnPage = group.map(i => entryHeights[i]);
            const numPhotosOnPage = photosOnPage.length;

            if (numPhotosOnPage > 0) {
                const availableHeight = maxYPos - yPos;
                
                if (numPhotosOnPage === 1) {
                    const photoHeight = heightsOnPage[0];
                    const virtualTotalContentHeight = photoHeight * 2;
                    const totalGapsHeight = availableHeight - virtualTotalContentHeight;
                    const numGaps = 4;
                    const gap = totalGapsHeight > 0 ? totalGapsHeight / numGaps : 2;

                    yPos += gap;
                    await drawPhotoEntry(doc, photosOnPage[0], yPos);
                    yPos += photoHeight;
                    
                    yPos += gap;
                    doc.setLineWidth(0.5);
                    doc.setDrawColor(0, 125, 140);
                    doc.line(margin, yPos, pageWidth - margin, yPos);
                } else {
                    const totalContentHeight = heightsOnPage.reduce((sum, h) => sum + h, 0);
                    const totalGapsHeight = availableHeight - totalContentHeight;
                    const numGaps = numPhotosOnPage * 2;
                    const gap = totalGapsHeight > 0 ? totalGapsHeight / numGaps : 2;
                    
                    yPos += gap; 
                    for (let i = 0; i < numPhotosOnPage; i++) {
                        const photo = photosOnPage[i];
                        const photoHeight = heightsOnPage[i];
                        
                        await drawPhotoEntry(doc, photo, yPos);
                        yPos += photoHeight;

                        if (i < numPhotosOnPage - 1) {
                            yPos += gap;
                            doc.setLineWidth(0.5);
                            doc.setDrawColor(0, 125, 140);
                            doc.line(margin, yPos, pageWidth - margin, yPos);
                            yPos += gap;
                        }
                    }
                }
            }
            drawFooterLine(doc);
        }
        
        const totalPages = (doc.internal as any).getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(10);
            doc.setFont('times', 'normal');
            doc.setTextColor(0, 0, 0);
            doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 7, { align: 'right' });
        }
        
        const pdfBlob = doc.output('blob');
        const pdfUrl = URL.createObjectURL(pdfBlob);
        setPdfPreview({ url: pdfUrl, filename: 'combinedlog.pdf', blob: pdfBlob });
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
            const zipFilename = `${sanitize(headerData.projectNumber) || 'project'}_${sanitize(headerData.projectName) || 'combinedlog'}_Photos.zip`;
            
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

    const downloadHandlerRef = useRef(handleDownloadPhotos);
    useEffect(() => {
        downloadHandlerRef.current = handleDownloadPhotos;
    }, [handleDownloadPhotos]);

    const stableListener = useCallback(() => {
        if (downloadHandlerRef.current) {
            downloadHandlerRef.current();
        }
    }, []);

    useEffect(() => {
        // @ts-ignore
        const api = window.electronAPI;
        if (api && api.onDownloadPhotos && api.removeAllDownloadPhotosListeners) {
            api.removeAllDownloadPhotosListeners();
            api.onDownloadPhotos(stableListener);
        }
        return () => {
            if (api && api.removeDownloadPhotosListener) {
                api.removeDownloadPhotosListener(stableListener);
            }
        };
    }, [stableListener]);

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
            const fileContent = await window.electronAPI.loadProject('clog');
            if (fileContent) {
                await parseAndLoadProject(fileContent);
            }
        } else {
            fileInputRef.current?.click();
        }
    };

    const getHeaderErrors = (): Set<keyof HeaderData> => {
        const headerErrors = new Set<keyof HeaderData>();
        errors.forEach(errorKey => {
            if (!errorKey.startsWith('photo-') && Object.keys(headerData).includes(errorKey)) {
                headerErrors.add(errorKey as keyof HeaderData);
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
        <div className="bg-gray-100 dark:bg-gray-900 min-h-screen transition-colors duration-200">
            {pdfPreview && (
                <PdfPreviewModal 
                    url={pdfPreview.url} 
                    filename={pdfPreview.filename} 
                    onClose={() => setPdfPreview(null)} 
                    pdfBlob={pdfPreview.blob}
                />
            )}
            {enlargedImageUrl && (
                <ImageModal imageUrl={enlargedImageUrl} onClose={() => setEnlargedImageUrl(null)} />
            )}
            {showStatusModal && <ActionStatusModal message={statusMessage} />}
            <SpecialCharacterPalette />
            
            <ImportProjectsModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onImport={handleImportProjects}
                currentProjectTimestamp={projectTimestamp}
            />

            <div className="max-w-7xl mx-auto p-4 md:p-8">
                <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
                    <button onClick={onBack} className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white text-gray-800 font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200">
                        <ArrowLeftIcon /> <span>Home</span>
                    </button>
                    <div className="flex flex-wrap justify-end gap-2">
                        <button onClick={handleOpenProject} className="bg-gray-600 hover:bg-gray-700 dark:bg-gray-500 dark:hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200">
                            <FolderOpenIcon /> <span>Open</span>
                        </button>
                         <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileSelected}
                            style={{ display: 'none' }}
                            accept=".clog"
                        />
                        
                        <button 
                            onClick={() => setIsImportModalOpen(true)}
                            className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200"
                        >
                            <DocumentDuplicateIcon className="h-5 w-5" /> <span>Import Recent</span>
                        </button>

                        <input
                            type="file"
                            ref={importFileInputRef}
                            onChange={handleImportFileSelected}
                            style={{ display: 'none' }}
                            accept=".plog,.dfr,.spdfr,.clog,.json"
                            multiple
                        />
                        <button 
                            onClick={handleImportFromFiles}
                            className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200"
                        >
                            <FolderArrowDownIcon className="h-5 w-5" /> <span>Import Files</span>
                        </button>

                        <button onClick={handleSaveProject} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200">
                            <SaveIcon /> <span>Save</span>
                        </button>
                         {/* @ts-ignore */}
                        {!window.electronAPI && (
                            <button onClick={handleDownloadPhotos} className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200">
                                <FolderArrowDownIcon /> <span>Photos</span>
                            </button>
                        )}
                        <button onClick={handleSavePdf} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200">
                            <DownloadIcon /> <span>PDF</span>
                        </button>
                    </div>
                </div>
                
                <div className="main-content">
                    <Header data={headerData} onDataChange={handleHeaderChange} errors={getHeaderErrors()} />
                    <div className="mt-8">
                        {photosData.map((photo, index) => (
                           <div key={photo.id}>
                                <PhotoEntry
                                    data={photo}
                                    onDataChange={(field, value) => handlePhotoDataChange(photo.id, field, value)}
                                    onImageChange={(file) => handleImageChange(photo.id, file)}
                                    onRemove={() => removePhoto(photo.id)}
                                    onMoveUp={() => movePhoto(photo.id, "up")}
                                    onMoveDown={() => movePhoto(photo.id, "down")}
                                    isFirst={index === 0}
                                    isLast={index === photosData.length - 1}
                                    onImageClick={setEnlargedImageUrl}
                                    errors={getPhotoErrors(photo.id)}
                                    showDirectionField={!photo.isMap}

                                    // NEW FIELDS
                                    headerDate={headerData.date}
                                    headerLocation={headerData.location}
                                    onAutoFill={(f, val) => handlePhotoDataChange(photo.id, f, val)}
                                />
                                {index < photosData.length - 1 && (
                                     <div className="relative my-10 flex items-center justify-center">
                                        <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                            <div className="w-full border-t-4 border-[#007D8C]"></div>
                                        </div>
                                        <div className="relative">
                                            <button
                                                onClick={() => addPhoto(index)}
                                                className="bg-white hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 text-[#007D8C] font-bold py-2 px-4 rounded-full border-2 border-[#007D8C] inline-flex items-center gap-2 transition duration-200 shadow-sm"
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

                    <div className="mt-8 flex justify-center">
                        <button
                            onClick={() => addPhoto()}
                            className="bg-[#007D8C] hover:bg-[#006b7a] text-white font-bold py-3 px-6 rounded-lg shadow-md inline-flex items-center gap-2 transition duration-200 text-lg"
                        >
                            <PlusIcon />
                            <span>Add Photo</span>
                        </button>
                    </div>
                </div>
                {photosData.length > 0 && <div className="border-t-4 border-[#007D8C] my-8" />}
                <footer className="text-center text-gray-500 dark:text-gray-400 text-sm py-4">
                    X-TES Digital Reporting v1.1.2
                </footer>
            </div>
            {showUnsupportedFileModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 transition-opacity duration-300">
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-2xl text-center relative max-w-md transform scale-95 hover:scale-100 transition-transform duration-300">
                        <button
                            onClick={() => setShowUnsupportedFileModal(false)}
                            className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                            aria-label="Close"
                        >
                            <CloseIcon className="h-6 w-6" />
                        </button>
                        <SafeImage
                            fileName="loading-error.gif"
                            alt="Unsupported file type animation"
                            className="mx-auto mb-4 w-40 h-40"
                        />
                        <h3 className="text-2xl font-bold mb-2 text-gray-800 dark:text-white">Unsupported File Type</h3>
                        <p className="text-gray-600 dark:text-gray-300">
                            Please upload a supported image file.
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
                            Supported formats: <strong>JPG, PNG</strong>
                        </p>
                    </div>
                </div>
            )}
            {showValidationErrorModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 transition-opacity duration-300">
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-2xl text-center relative max-w-md transform scale-95 hover:scale-100 transition-transform duration-300">
                        <button
                            onClick={() => setShowValidationErrorModal(false)}
                            className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                            aria-label="Close"
                        >
                            <CloseIcon className="h-6 w-6" />
                        </button>
                        <SafeImage
                            fileName="loading-error.gif"
                            alt="Missing information animation"
                            className="mx-auto mb-4 w-40 h-40"
                        />
                        <h3 className="text-2xl font-bold mb-2 text-gray-800 dark:text-white">Missing Information</h3>
                        <p className="text-gray-600 dark:text-gray-300">
                            Please fill in all required fields.
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
                            Missing fields are highlighted in red.
                        </p>
                    </div>
                </div>
            )}
             {showNoInternetModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-2xl text-center relative max-w-md">
                        <button
                            onClick={() => setShowNoInternetModal(false)}
                            className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                            aria-label="Close"
                        >
                            <CloseIcon className="h-6 w-6" />
                        </button>
                        <h3 className="text-2xl font-bold mb-2 text-gray-800 dark:text-white">No Internet Connection</h3>
                        <p className="text-gray-600 dark:text-gray-300">
                            An internet connection is required to save the PDF. Please connect to the internet and try again.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CombinedLog;