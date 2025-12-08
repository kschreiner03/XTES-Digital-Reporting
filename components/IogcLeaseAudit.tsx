
import React, { useState, useEffect, useRef } from 'react';
import type { IogcAuditData, PhotoData } from '../types';
import { ArrowLeftIcon, FolderOpenIcon, SaveIcon, DownloadIcon, PlusIcon, TrashIcon, CloseIcon } from './icons';
import { AppType } from '../App';
import { storeImage, retrieveImage, deleteImage, storeProject, deleteProject, retrieveProject } from './db';
import { SpecialCharacterPalette } from './SpecialCharacterPalette';
import ActionStatusModal from './ActionStatusModal';
import PhotoEntry from './PhotoEntry';
import ImageModal from './ImageModal';
import { jsPDF } from 'jspdf';
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

const addRecentProject = async (projectData: any, projectInfo: { type: AppType; name: string; projectNumber: string; }) => {
    const timestamp = Date.now();
    try {
        await storeProject(timestamp, projectData);
    } catch (e) {
        console.error("Failed to save project to IndexedDB:", e);
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
    if (updatedProjects.length > 50) {
        const projectsToDelete = updatedProjects.splice(50);
        for (const proj of projectsToDelete) {
             try {
                const projectDataToDelete = await retrieveProject(proj.timestamp);
                if (projectDataToDelete?.photosData) {
                    for (const photo of projectDataToDelete.photosData) {
                        if (photo.imageId) await deleteImage(photo.imageId);
                    }
                }
                await deleteProject(proj.timestamp);
            } catch (e) { console.error(e); }
        }
    }
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updatedProjects));
};

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
            if (!ctx) { resolve(imageUrl); return; }
            const canvasWidth = 1024; const canvasHeight = 768;
            canvas.width = canvasWidth; canvas.height = canvasHeight;
            ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            const targetAspectRatio = 4/3; const originalAspectRatio = img.width / img.height;
            let drawWidth, drawHeight, drawX, drawY;
            if (originalAspectRatio > targetAspectRatio) {
                drawWidth = canvas.width; drawHeight = drawWidth / originalAspectRatio;
                drawX = 0; drawY = (canvas.height - drawHeight) / 2;
            } else {
                drawHeight = canvas.height; drawWidth = drawHeight * originalAspectRatio;
                drawY = 0; drawX = (canvas.width - drawWidth) / 2;
            }
            ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
            resolve(canvas.toDataURL('image/jpeg'));
        };
        img.src = imageUrl;
    });
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

// --- Questions Structure ---
const AUDIT_SECTIONS = [
    {
        id: 'lease',
        title: 'A. Lease Facilities',
        questions: [
            { id: 'A1', text: 'Signage: Is the lease identification sign present, legible, and accurate?' },
            { id: 'A2', text: 'Condition: Are facilities painted, rust-free, and in good repair?' },
            { id: 'A3', text: 'Fencing: Is the perimeter fencing intact (if applicable)?' },
            { id: 'A4', text: 'Spacing: Is proper spacing maintained between equipment and vegetation?' },
        ]
    },
    {
        id: 'veg',
        title: 'B. Vegetation',
        questions: [
            { id: 'B1', text: 'Weed Control: Is the lease free of noxious weeds?' },
            { id: 'B2', text: 'Encroachment: Is vegetation encroaching on facilities or access roads?' },
            { id: 'B3', text: 'Growth: Is vegetation growth consistent with off-site control areas?' },
        ]
    },
    {
        id: 'housekeeping',
        title: 'C. Housekeeping',
        questions: [
            { id: 'C1', text: 'Debris: Is the site free of garbage, debris, and scrap metal?' },
            { id: 'C2', text: 'Storage: Are materials stored neatly and safely?' },
            { id: 'C3', text: 'Spills: Is there any visual evidence of staining or spills on the ground?' },
        ]
    },
    {
        id: 'env',
        title: 'D. Environmental Protection',
        questions: [
            { id: 'D1', text: 'Containment: Is secondary containment present and adequate for tanks?' },
            { id: 'D2', text: 'Drainage: Is surface water drainage managed correctly?' },
            { id: 'D3', text: 'Erosion: Are there any signs of soil erosion or instability?' },
        ]
    }
];

// --- Subcomponents ---
const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
    <div className="bg-[#007D8C] text-white px-4 py-2 font-bold text-lg rounded-t-md mt-6">
        {title}
    </div>
);

const InputGroup: React.FC<{ label: string; value: string; onChange: (v: string) => void; placeholder?: string }> = ({ label, value, onChange, placeholder }) => (
    <div className="flex flex-col">
        <label className="text-sm font-bold text-gray-700 mb-1">{label}</label>
        <input 
            type="text" 
            value={value} 
            onChange={(e) => onChange(e.target.value)} 
            placeholder={placeholder}
            className="border border-gray-300 rounded p-2 focus:ring-2 focus:ring-[#007D8C] focus:border-[#007D8C] transition"
        />
    </div>
);

const CheckboxGroup: React.FC<{ title: string; options: string[]; selected: string[]; onChange: (sel: string[]) => void }> = ({ title, options, selected, onChange }) => {
    const toggle = (opt: string) => {
        if (selected.includes(opt)) onChange(selected.filter(s => s !== opt));
        else onChange([...selected, opt]);
    };
    return (
        <div className="bg-white p-4 rounded shadow-sm border border-gray-200">
            <h4 className="font-bold text-gray-700 mb-2 border-b pb-1">{title}</h4>
            <div className="grid grid-cols-2 gap-2">
                {options.map(opt => (
                    <label key={opt} className="flex items-center space-x-2 cursor-pointer">
                        <input 
                            type="checkbox" 
                            checked={selected.includes(opt)} 
                            onChange={() => toggle(opt)} 
                            className="text-[#007D8C] focus:ring-[#007D8C] rounded"
                        />
                        <span className="text-sm">{opt}</span>
                    </label>
                ))}
            </div>
        </div>
    );
};

interface IogcLeaseAuditProps {
    onBack: () => void;
    initialData?: any;
}

const IogcLeaseAudit: React.FC<IogcLeaseAuditProps> = ({ onBack, initialData }) => {
    const [data, setData] = useState<IogcAuditData>({
        iogcFileNumber: '', legalLocation: '', province: '', reserveName: '', lesseeName: '', spudDate: '', auditDate: '',
        siteStatus: [], siteType: [], products: [], auditType: '', copySentToFirstNation: false,
        reportAddresses: { leaseFacilities: true, vegetation: true, housekeeping: true, protection: true, summary: true, complianceReview: true },
        attachments: { termsLetter: false, sketch: false, photos: true, followUpLog: false },
        complianceStatus: '', nonComplianceIssues: 'N/A', recommendations: 'N/A', complianceDescription: 'included',
        declarationName: '', declarationDate: '', questions: {}
    });
    const [photosData, setPhotosData] = useState<PhotoData[]>([]);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [enlargedImageUrl, setEnlargedImageUrl] = useState<string | null>(null);
    const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string; blob?: Blob } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (initialData) {
            const { photosData: loadedPhotos, ...rest } = initialData;
            setData(prev => ({ ...prev, ...rest }));
            if (loadedPhotos && Array.isArray(loadedPhotos)) {
                Promise.all(loadedPhotos.map(async (photo: PhotoData) => {
                    if (photo.imageId && !photo.imageUrl) {
                        const imageUrl = await retrieveImage(photo.imageId);
                        return { ...photo, imageUrl: imageUrl || null };
                    }
                    return photo;
                })).then(setPhotosData);
            }
        }
    }, [initialData]);

    // Question Handling
    const handleQuestionResponse = (id: string, type: 'response' | 'comments', value: string) => {
        setData(prev => ({
            ...prev,
            questions: {
                ...prev.questions,
                [id]: {
                    ...prev.questions[id],
                    [type]: value
                }
            }
        }));
    };

    // Photo Handling
    const addPhoto = () => {
        const newId = photosData.length > 0 ? Math.max(...photosData.map(p => p.id)) + 1 : 1;
        setPhotosData(prev => [...prev, { id: newId, photoNumber: String(prev.length + 1), date: data.auditDate, location: '', description: '', imageUrl: null, direction: '' }]);
    };
    const removePhoto = (id: number) => setPhotosData(prev => prev.filter(p => p.id !== id).map((p, i) => ({ ...p, photoNumber: String(i + 1) })));
    const updatePhoto = (id: number, field: keyof PhotoData, value: string) => setPhotosData(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
    const handleImageChange = (id: number, file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            autoCropImage(e.target?.result as string).then(url => {
                setPhotosData(prev => prev.map(p => p.id === id ? { ...p, imageUrl: url } : p));
            });
        };
        reader.readAsDataURL(file);
    };

    // Save/Load Logic
    const handleSaveProject = async () => {
        const photosForStorage = await Promise.all(photosData.map(async (photo) => {
            if (photo.imageUrl) {
                const imageId = photo.imageId || `${data.iogcFileNumber}-${photo.id}-${Date.now()}`;
                await storeImage(imageId, photo.imageUrl);
                const { imageUrl, ...rest } = photo;
                return { ...rest, imageId };
            }
            return photo;
        }));
        const stateToSave = { ...data, photosData: photosForStorage };
        const name = `IOGC Audit ${data.iogcFileNumber || 'Untitled'}`;
        await addRecentProject(stateToSave, { type: 'iogcLeaseAudit', name, projectNumber: data.iogcFileNumber });
        
        // Export file
        const photosForExport = photosData.map(({ imageId, ...photo }) => photo);
        const fileState = { ...data, photosData: photosForExport };
        const filename = `IOGC_${(data.iogcFileNumber || 'Audit').replace(/[^a-z0-9]/gi, '')}.iogc`;
        
        // @ts-ignore
        if (window.electronAPI) await window.electronAPI.saveProject(JSON.stringify(fileState), filename);
        else {
            const blob = new Blob([JSON.stringify(fileState)], { type: 'application/json' });
            const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename;
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
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
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'letter' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 12.7;
        let y = margin;

        await addSafeLogo(doc, margin, y, 40, 10);
        
        y += 15;
        doc.setFontSize(16); doc.setTextColor(0, 125, 140); doc.setFont('times', 'bold');
        doc.text("IOGC LEASE AUDIT", pageWidth/2, y, { align: 'center' });
        y += 10;

        // Basic Info
        doc.setFontSize(11); doc.setTextColor(0,0,0); doc.setFont('times', 'normal');
        const addLine = (label: string, val: string) => {
            doc.setFont('times', 'bold'); doc.text(`${label}:`, margin, y);
            doc.setFont('times', 'normal'); doc.text(val || ' ', margin + 40, y);
            y += 6;
        };
        addLine("IOGC File #", data.iogcFileNumber);
        addLine("Lessee", data.lesseeName);
        addLine("Location", data.legalLocation);
        addLine("Date", data.auditDate);
        y += 5;

        // Questions
        AUDIT_SECTIONS.forEach(section => {
            if (y > 250) { doc.addPage(); y = margin; }
            doc.setFillColor(0, 125, 140); doc.rect(margin, y, pageWidth - 2*margin, 7, 'F');
            doc.setTextColor(255,255,255); doc.setFont('times', 'bold');
            doc.text(section.title, margin + 2, y + 5);
            y += 10;
            doc.setTextColor(0,0,0); 

            section.questions.forEach(q => {
                const qData = data.questions[q.id] || { response: '', comments: '' };
                if (y > 260) { doc.addPage(); y = margin; }
                
                doc.setFont('times', 'bold'); doc.setFontSize(10);
                doc.text(q.text, margin, y);
                y += 5;
                
                doc.setFont('times', 'normal');
                doc.text(`Response: ${qData.response || '-'}`, margin + 5, y);
                if (qData.comments) {
                    y += 5;
                    const splitComments = doc.splitTextToSize(`Comments: ${qData.comments}`, pageWidth - 2*margin - 5);
                    doc.text(splitComments, margin + 5, y);
                    y += (splitComments.length * 5);
                } else {
                    y += 5;
                }
                y += 3; // Gap
            });
            y += 5;
        });

        // Photos
        if (photosData.length > 0) {
            doc.addPage(); y = margin;
            doc.setFontSize(16); doc.setTextColor(0, 125, 140); doc.setFont('times', 'bold');
            doc.text("PHOTOGRAPHIC LOG", pageWidth/2, y, { align: 'center' });
            y += 15;

            for (let i = 0; i < photosData.length; i++) {
                const photo = photosData[i];
                if (y > 200) { doc.addPage(); y = margin; }
                
                if (photo.imageUrl) {
                    try {
                        const {width, height} = await getImageDimensions(photo.imageUrl);
                        const ratio = Math.min(100/width, 80/height);
                        const w = width * ratio; const h = height * ratio;
                        doc.addImage(photo.imageUrl, 'JPEG', margin, y, w, h);
                        
                        doc.setTextColor(0,0,0); doc.setFontSize(10); doc.setFont('times', 'bold');
                        doc.text(`Photo ${photo.photoNumber}:`, margin + w + 5, y + 5);
                        doc.setFont('times', 'normal');
                        const splitDesc = doc.splitTextToSize(photo.description || '', 60);
                        doc.text(splitDesc, margin + w + 5, y + 10);
                        
                        y += h + 10;
                    } catch (e) { console.error(e); }
                }
            }
        }

        const filename = `IOGC_Report_${data.iogcFileNumber || 'draft'}.pdf`;
        const pdfBlob = doc.output('blob');
        const pdfUrl = URL.createObjectURL(pdfBlob);
        setPdfPreview({ url: pdfUrl, filename, blob: pdfBlob });
    };

    return (
        <div className="bg-gray-100 min-h-screen pb-20">
             {pdfPreview && (
                <PdfPreviewModal 
                    url={pdfPreview.url} 
                    filename={pdfPreview.filename} 
                    onClose={() => setPdfPreview(null)} 
                    pdfBlob={pdfPreview.blob}
                />
             )}
             {showStatusModal && <ActionStatusModal message={statusMessage} />}
             <SpecialCharacterPalette />
             {enlargedImageUrl && <ImageModal imageUrl={enlargedImageUrl} onClose={() => setEnlargedImageUrl(null)} />}
             
             <div className="max-w-7xl mx-auto p-4">
                 <div className="flex justify-between items-center mb-6">
                    <button onClick={onBack} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold px-4 py-2 rounded flex items-center gap-2 transition">
                        <ArrowLeftIcon /> Home
                    </button>
                    <div className="flex gap-2">
                        <input type="file" ref={fileInputRef} onChange={(e) => {}} style={{ display: 'none' }} accept=".iogc" />
                        <button onClick={() => fileInputRef.current?.click()} className="bg-gray-600 hover:bg-gray-700 text-white font-bold px-4 py-2 rounded flex items-center gap-2">
                            <FolderOpenIcon /> Open
                        </button>
                        <button onClick={handleSaveProject} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded flex items-center gap-2">
                            <SaveIcon /> Save
                        </button>
                        <button onClick={handleSavePdf} className="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded flex items-center gap-2">
                            <DownloadIcon /> PDF
                        </button>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow-md p-8">
                    <h1 className="text-3xl font-bold text-[#007D8C] border-b-4 border-[#007D8C] pb-4 mb-8">IOGC LEASE AUDIT</h1>
                    
                    {/* Header Inputs */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <InputGroup label="IOGC File Number" value={data.iogcFileNumber} onChange={v => setData({...data, iogcFileNumber: v})} />
                        <InputGroup label="Legal Location" value={data.legalLocation} onChange={v => setData({...data, legalLocation: v})} />
                        <InputGroup label="Province" value={data.province} onChange={v => setData({...data, province: v})} />
                        <InputGroup label="Reserve Name" value={data.reserveName} onChange={v => setData({...data, reserveName: v})} />
                        <InputGroup label="Lessee Name" value={data.lesseeName} onChange={v => setData({...data, lesseeName: v})} />
                        <InputGroup label="Audit Date" value={data.auditDate} onChange={v => setData({...data, auditDate: v})} placeholder="Month Day, Year"/>
                    </div>

                    {/* Checkboxes */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <CheckboxGroup title="Site Status" options={['Active', 'Suspended', 'Abandoned', 'Reclaimed']} selected={data.siteStatus} onChange={s => setData({...data, siteStatus: s})} />
                        <CheckboxGroup title="Site Type" options={['Well Site', 'Battery', 'Compressor', 'Satellite']} selected={data.siteType} onChange={s => setData({...data, siteType: s})} />
                    </div>

                    {/* Audit Sections */}
                    {AUDIT_SECTIONS.map(section => (
                        <div key={section.id} className="mb-8 border border-gray-200 rounded-md overflow-hidden">
                            <SectionHeader title={section.title} />
                            <div className="p-4 bg-gray-50 space-y-4">
                                {section.questions.map(q => {
                                    const qData = data.questions[q.id] || { response: '', comments: '' };
                                    return (
                                        <div key={q.id} className="bg-white p-4 rounded shadow-sm">
                                            <p className="font-semibold text-gray-800 mb-2">{q.id}. {q.text}</p>
                                            <div className="flex flex-wrap gap-4 mb-2">
                                                {['Yes', 'No', 'N/A'].map(opt => (
                                                    <label key={opt} className="flex items-center space-x-2 cursor-pointer">
                                                        <input 
                                                            type="radio" 
                                                            name={`q-${q.id}`} 
                                                            checked={qData.response === opt} 
                                                            onChange={() => handleQuestionResponse(q.id, 'response', opt)}
                                                            className="text-[#007D8C] focus:ring-[#007D8C]"
                                                        />
                                                        <span>{opt}</span>
                                                    </label>
                                                ))}
                                            </div>
                                            <textarea 
                                                className="w-full border border-gray-300 rounded p-2 text-sm" 
                                                placeholder="Comments / Observations..." 
                                                rows={2}
                                                value={qData.comments}
                                                onChange={(e) => handleQuestionResponse(q.id, 'comments', e.target.value)}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    {/* Photos */}
                    <div className="mt-12">
                        <SectionHeader title="Photographic Log" />
                        <div className="p-6 bg-gray-50">
                            {photosData.map((photo, idx) => (
                                <div key={photo.id} className="mb-6">
                                    <PhotoEntry 
                                        data={photo} 
                                        onDataChange={(f, v) => updatePhoto(photo.id, f, v as string)} 
                                        onImageChange={(file) => handleImageChange(photo.id, file)}
                                        onRemove={() => removePhoto(photo.id)}
                                        onMoveUp={() => {}} 
                                        onMoveDown={() => {}}
                                        isFirst={idx === 0} 
                                        isLast={idx === photosData.length - 1}
                                        onImageClick={setEnlargedImageUrl}
                                        showDirectionField={true}
                                    />
                                </div>
                            ))}
                            <button onClick={addPhoto} className="mt-4 w-full py-3 border-2 border-dashed border-gray-400 rounded-lg text-gray-500 hover:bg-gray-100 font-bold flex items-center justify-center gap-2">
                                <PlusIcon /> Add Photo
                            </button>
                        </div>
                    </div>

                </div>
             </div>
        </div>
    );
};

export default IogcLeaseAudit;
