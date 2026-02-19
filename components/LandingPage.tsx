
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { StandardDfrIcon, CameraIcon, SaskPowerIcon, SearchIcon, FolderOpenIcon, EllipsisVerticalIcon, DocumentDuplicateIcon } from './icons';
import { AppType } from '../App';
import { deleteImage, deleteProject, deleteThumbnail, retrieveProject, getAllThumbnails } from './db';
import SafeImage, { getAssetUrl } from './SafeImage';
import ProjectPreviewTooltip from './ProjectPreviewTooltip';
import WhatsNewModal, { shouldShowWhatsNew } from './WhatsNewModal';

export interface RecentProject {
    type: AppType;
    name: string;
    projectNumber: string;
    timestamp: number; // Used as project ID
}

interface LandingPageProps {
  onSelectApp: (app: AppType) => void;
  onOpenProject: (project: RecentProject) => void;
}

const RECENT_PROJECTS_KEY = 'xtec_recent_projects';
const MAX_RECENT_PROJECTS = 5;


const getRecentProjects = (): RecentProject[] => {
    try {
        const projects = localStorage.getItem(RECENT_PROJECTS_KEY);
        return projects ? JSON.parse(projects) : [];
    } catch (e) {
        console.error("Failed to parse recent projects from localStorage", e);
        return [];
    }
};

const getReportTypeName = (type: AppType): string => {
    switch (type) {
        case 'photoLog':
            return 'Photographic Log';
        case 'dfrStandard':
            return 'Daily field Report';
        case 'dfrSaskpower':
            return 'Sask Power Daily Field Report';
        case 'combinedLog':
            return 'Combine Logs';
        default:
            return 'Report';
    }
};


const AppSelectionCard: React.FC<{ title: string; description: string; icon: React.ReactNode; onClick: () => void; }> = ({ title, description, icon, onClick }) => (
    <div
        onClick={onClick}
        className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm hover:border-[#007D8C]/40 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm transition-all duration-200 cursor-pointer flex flex-col items-center text-center group"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
        aria-label={`Select ${title}`}
    >
        <div className="w-14 h-14 rounded-2xl bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 flex items-center justify-center mb-4 group-hover:border-[#007D8C]/30 group-hover:scale-105 transition-all duration-200">
            <div className="text-[#007D8C]">
                {icon}
            </div>
        </div>
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-1 group-hover:text-[#007D8C] transition-colors duration-200">{title}</h3>
        <p className="text-gray-500 dark:text-gray-400 text-xs leading-relaxed">{description}</p>
    </div>
);

const LandingPage: React.FC<LandingPageProps> = ({ onSelectApp, onOpenProject }) => {
    const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [openMenuTimestamp, setOpenMenuTimestamp] = useState<number | null>(null);
    const [isRecentProjectsExpanded, setIsRecentProjectsExpanded] = useState(false);

    const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());
    const [hoveredTimestamp, setHoveredTimestamp] = useState<number | null>(null);
    const [customBgPhoto, setCustomBgPhoto] = useState<string | null>(null);
    const [presetBgUrl, setPresetBgUrl] = useState<string | null>(null);
    const [bgPosition, setBgPosition] = useState('center 85%');
    const [bgZoom, setBgZoom] = useState(1.0);
    const [bgImgDims, setBgImgDims] = useState({ w: 0, h: 0 });
    const [headerWidth, setHeaderWidth] = useState(0);
    const [showWhatsNew, setShowWhatsNew] = useState(() => shouldShowWhatsNew());
    const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLElement>(null);

    useEffect(() => {
        setRecentProjects(getRecentProjects());

        // Load custom landing page photo and position
        const savedPreset = localStorage.getItem('xtec_landing_photo_preset');
        const savedPhoto = localStorage.getItem('xtec_landing_photo');
        if (savedPreset) {
            // presetBgFile tracked via URL only
            getAssetUrl(savedPreset).then(url => setPresetBgUrl(url));
        } else if (savedPhoto) {
            setCustomBgPhoto(savedPhoto);
        }
        const savedPos = localStorage.getItem('xtec_landing_photo_position');
        if (savedPos) setBgPosition(savedPos);
        const savedZoom = localStorage.getItem('xtec_landing_photo_zoom');
        if (savedZoom) setBgZoom(parseFloat(savedZoom));

        // Prefetch all thumbnails
        getAllThumbnails()
            .then(thumbMap => setThumbnails(thumbMap))
            .catch(e => console.error("Failed to load thumbnails:", e));

        // Initialize spell check languages from saved settings
        const initSpellCheck = async () => {
            const electronAPI = (window as any).electronAPI;
            const savedLanguages = localStorage.getItem('xtec_spellcheck_languages');
            if (savedLanguages && electronAPI?.setSpellCheckLanguages) {
                try {
                    const languages = JSON.parse(savedLanguages);
                    if (Array.isArray(languages) && languages.length > 0) {
                        await electronAPI.setSpellCheckLanguages(languages);
                    }
                } catch (e) {
                    console.error("Failed to initialize spell check languages", e);
                }
            }
        };
        initSpellCheck();

        // Listen for background photo changes from Settings
        const handleBgPhotoChanged = () => {
            const preset = localStorage.getItem('xtec_landing_photo_preset');
            const photo = localStorage.getItem('xtec_landing_photo');
            if (preset) {

                getAssetUrl(preset).then(url => setPresetBgUrl(url));
                setCustomBgPhoto(null);
            } else if (photo) {
                setCustomBgPhoto(photo);

                setPresetBgUrl(null);
            } else {
                setCustomBgPhoto(null);

                setPresetBgUrl(null);
            }
            setBgImgDims({ w: 0, h: 0 }); // Reset so onLoad re-measures
            const pos = localStorage.getItem('xtec_landing_photo_position');
            setBgPosition(pos || 'center 85%');
            const zoom = localStorage.getItem('xtec_landing_photo_zoom');
            setBgZoom(zoom ? parseFloat(zoom) : 1.0);
        };
        window.addEventListener('xtec-bg-photo-changed', handleBgPhotoChanged);

        return () => {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
            window.removeEventListener('xtec-bg-photo-changed', handleBgPhotoChanged);
        };
    }, []);

    // Close context menu when clicking outside
    useEffect(() => {
        if (!openMenuTimestamp) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpenMenuTimestamp(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [openMenuTimestamp]);

    // Measure header width for image sizing
    useEffect(() => {
        const measure = () => {
            if (headerRef.current) setHeaderWidth(headerRef.current.clientWidth);
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, []);

    // Compute explicit image style for the header background
    const getHeaderImgStyle = (): React.CSSProperties => {
        const HEADER_H = 448; // h-[28rem]
        if (!bgImgDims.w || !bgImgDims.h || !headerWidth) {
            // Fallback before dims known
            return { width: '100%', height: '100%', objectFit: 'cover' as const, objectPosition: bgPosition };
        }
        const imgAspect = bgImgDims.w / bgImgDims.h;
        const containerAspect = headerWidth / HEADER_H;
        let baseW: number, baseH: number;
        if (imgAspect > containerAspect) {
            baseH = HEADER_H; baseW = HEADER_H * imgAspect;
        } else {
            baseW = headerWidth; baseH = headerWidth / imgAspect;
        }
        const dW = baseW * bgZoom;
        const dH = baseH * bgZoom;
        // Parse vertical position from "center XX%"
        const match = bgPosition.match(/(\d+)%/);
        const posPct = match ? parseInt(match[1]) : 50;
        const overflowY = dH - HEADER_H;
        return {
            position: 'absolute' as const,
            width: dW,
            height: dH,
            left: (headerWidth - dW) / 2,
            top: overflowY > 0 ? -(posPct / 100) * overflowY : (HEADER_H - dH) / 2,
        };
    };

    const filteredProjects = useMemo(() => {
        if (!searchTerm) {
            return recentProjects;
        }
        return recentProjects.filter(p =>
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.projectNumber.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [searchTerm, recentProjects]);

    const handleMouseEnter = (timestamp: number) => {
        hoverTimeoutRef.current = setTimeout(() => {
            setHoveredTimestamp(timestamp);
        }, 150);
    };

    const handleMouseLeave = () => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
        }
        setHoveredTimestamp(null);
    };

    const handleRemoveFromRecent = (timestamp: number) => {
        const updatedProjects = recentProjects.filter(p => p.timestamp !== timestamp);
        localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updatedProjects));
        setRecentProjects(updatedProjects);
        setOpenMenuTimestamp(null);
        setThumbnails(prev => {
            const next = new Map(prev);
            next.delete(timestamp);
            return next;
        });
    };

    const handleDeleteProject = async (projectToDelete: RecentProject) => {
        if (!window.confirm(`Are you sure you want to permanently delete "${projectToDelete.name || 'Untitled Project'}"? This action cannot be undone.`)) {
            setOpenMenuTimestamp(null);
            return;
        }

        const updatedProjects = recentProjects.filter(p => p.timestamp !== projectToDelete.timestamp);
        localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updatedProjects));
        setRecentProjects(updatedProjects);

        try {
            const projectData = await retrieveProject(projectToDelete.timestamp);
            if (projectData?.photosData && Array.isArray(projectData.photosData)) {
                for (const photo of projectData.photosData) {
                    if (photo.imageId) {
                        await deleteImage(photo.imageId);
                    }
                }
            }
        } catch (e) {
            console.error("Failed to retrieve project data for image deletion:", e);
        }

        try {
            await deleteProject(projectToDelete.timestamp);
        } catch(e) {
            console.error("Failed to delete project from DB:", e);
        }

        try {
            await deleteThumbnail(projectToDelete.timestamp);
        } catch(e) {
            console.error("Failed to delete thumbnail from DB:", e);
        }

        setThumbnails(prev => {
            const next = new Map(prev);
            next.delete(projectToDelete.timestamp);
            return next;
        });
        setOpenMenuTimestamp(null);
    };

    const projectsToShow = isRecentProjectsExpanded ? filteredProjects : filteredProjects.slice(0, MAX_RECENT_PROJECTS);


    return (
        <div className="bg-gray-50 dark:bg-gray-900 min-h-screen transition-colors duration-200">
            <header ref={headerRef} className="relative h-[28rem] bg-black overflow-hidden">
                {/* Determine the active background image source */}
                {(() => {
                    const activeSrc = customBgPhoto || presetBgUrl;
                    const handleImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
                        const img = e.currentTarget;
                        setBgImgDims({ w: img.naturalWidth, h: img.naturalHeight });
                    };
                    const blurStyle = { filter: 'blur(24px) saturate(1.2)', transform: 'scale(1.15)', opacity: 0.5 };

                    if (activeSrc) {
                        return (
                            <>
                                {/* Blurred fill layer */}
                                <img src={activeSrc} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={blurStyle} />
                                {/* Main image — explicitly sized */}
                                <img src={activeSrc} alt="Landing background" className="saturate-150 opacity-85 dark:opacity-70 pointer-events-none" style={getHeaderImgStyle()} onLoad={handleImgLoad} />
                            </>
                        );
                    }
                    // Default: landscape.jpg via SafeImage
                    return (
                        <>
                            <SafeImage fileName="landscape.jpg" alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={blurStyle} />
                            <SafeImage fileName="landscape.jpg" alt="Oil field landscape" className="saturate-150 opacity-85 dark:opacity-70 pointer-events-none" style={getHeaderImgStyle()} onLoad={handleImgLoad} />
                        </>
                    );
                })()}
                <div className="absolute inset-0 bg-gradient-to-t from-gray-50 dark:from-gray-900 via-transparent to-black/20"></div>
            </header>

            <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 -mt-32 relative z-10">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl shadow-black/5 dark:shadow-black/20 p-8 md:p-10 mb-8 transition-colors duration-200 border border-gray-200/40 dark:border-gray-700/40">
                    <div className="text-center pb-8">
                        <SafeImage
                            fileName="xterra-logo.jpg"
                            alt="X-TERRA Logo"
                            className="h-14 w-auto mx-auto mb-5 mix-blend-multiply dark:mix-blend-normal dark:bg-white dark:p-1.5 dark:rounded-lg"
                        />
                        <h1 className="text-2xl font-bold text-gray-800 dark:text-white sm:text-3xl tracking-tight">
                            Create a New Report
                        </h1>
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-lg mx-auto">
                            Select a report type to begin a new project.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <AppSelectionCard
                            title="Photo Log"
                            description="Create and edit photographic logs."
                            icon={<CameraIcon className="h-7 w-7" />}
                            onClick={() => onSelectApp('photoLog')}
                        />
                        <AppSelectionCard
                            title="Daily Field Report"
                            description="Standard DFR for project documentation."
                            icon={<StandardDfrIcon className="h-7 w-7" />}
                            onClick={() => onSelectApp('dfrStandard')}
                        />
                        <AppSelectionCard
                            title="SaskPower DFR"
                            description="DFR tailored for SaskPower projects."
                            icon={<SaskPowerIcon className="h-7 w-7" />}
                            onClick={() => onSelectApp('dfrSaskpower')}
                        />
                        <AppSelectionCard
                            title="Combine Logs"
                            description="Merge photos from multiple reports."
                            icon={<DocumentDuplicateIcon className="h-7 w-7" />}
                            onClick={() => onSelectApp('combinedLog')}
                        />
                    </div>
                </div>

                <div>
                    <div className="flex items-center justify-between mb-4 px-1">
                        <h2 className="text-xl font-bold text-gray-800 dark:text-white">
                            Recent Projects
                        </h2>
                        {filteredProjects.length > MAX_RECENT_PROJECTS && (
                            <button
                                onClick={() => setIsRecentProjectsExpanded(!isRecentProjectsExpanded)}
                                className="text-sm text-[#007D8C] hover:text-[#006b7a] font-medium transition-colors duration-200"
                            >
                                {isRecentProjectsExpanded ? 'Show Less' : `See All (${filteredProjects.length})`}
                            </button>
                        )}
                    </div>

                    <div className="mb-4">
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                <SearchIcon className="text-gray-400 dark:text-gray-500 h-4 w-4" />
                            </div>
                            <input
                                type="search"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search by project name or number..."
                                className="block w-full pl-10 pr-4 py-2.5 border-0 rounded-xl leading-5 bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 text-gray-900 dark:text-white ring-1 ring-gray-200 dark:ring-gray-700 focus:ring-2 focus:ring-[#007D8C] text-sm shadow-sm transition-all duration-200"
                            />
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm ring-1 ring-gray-200/60 dark:ring-gray-700/60 overflow-visible transition-colors duration-200">
                        {filteredProjects.length > 0 ? (
                            <>
                                <ul>
                                    {projectsToShow.map((project, i) => (
                                        <li
                                            key={project.timestamp}
                                            className={`relative group ${openMenuTimestamp === project.timestamp ? 'z-50' : 'z-auto'}`}
                                            onMouseEnter={() => handleMouseEnter(project.timestamp)}
                                            onMouseLeave={handleMouseLeave}
                                        >
                                            {i > 0 && <div className="mx-4 border-t border-gray-100 dark:border-gray-700/50" />}
                                            <ProjectPreviewTooltip
                                                thumbnailUrl={thumbnails.get(project.timestamp) || null}
                                                visible={hoveredTimestamp === project.timestamp && openMenuTimestamp !== project.timestamp}
                                            />
                                            <button onClick={() => onOpenProject(project)} className="w-full text-left block hover:bg-gray-50/80 dark:hover:bg-gray-700/50 focus:outline-none focus:bg-gray-50 dark:focus:bg-gray-700/50 transition duration-150 ease-in-out pr-14 rounded-xl">
                                                <div className="px-4 py-3.5 sm:px-5 flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-xl bg-[#007D8C]/8 dark:bg-[#007D8C]/15 flex items-center justify-center flex-shrink-0">
                                                        <FolderOpenIcon className="h-5 w-5 text-[#007D8C]" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
                                                            {project.name || 'Untitled Project'}
                                                        </p>
                                                        <div className="mt-0.5 text-xs text-gray-400 dark:text-gray-500 flex flex-wrap items-center gap-x-1.5">
                                                            <span className="font-medium text-[#007D8C] bg-[#007D8C]/8 dark:bg-[#007D8C]/15 px-1.5 py-0.5 rounded-md text-[11px]">{getReportTypeName(project.type)}</span>
                                                            <span className="text-gray-300 dark:text-gray-600 hidden sm:inline">&middot;</span>
                                                            <span className="hidden sm:inline">#{project.projectNumber || 'N/A'}</span>
                                                            <span className="text-gray-300 dark:text-gray-600 hidden sm:inline">&middot;</span>
                                                            <span className="hidden sm:inline">{new Date(project.timestamp).toLocaleDateString()}</span>
                                                        </div>
                                                    </div>
                                                    <svg className="h-4 w-4 text-gray-300 dark:text-gray-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                                    </svg>
                                                </div>
                                            </button>
                                            <div className="absolute top-1/2 right-3 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150" ref={openMenuTimestamp === project.timestamp ? menuRef : undefined}>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setOpenMenuTimestamp(openMenuTimestamp === project.timestamp ? null : project.timestamp);
                                                    }}
                                                    className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 focus:outline-none transition-colors"
                                                    aria-haspopup="true"
                                                    aria-expanded={openMenuTimestamp === project.timestamp}
                                                >
                                                    <EllipsisVerticalIcon className="h-5 w-5" />
                                                </button>
                                                 {openMenuTimestamp === project.timestamp && (
                                                    <div
                                                        className="origin-top-right absolute right-0 mt-1 w-52 rounded-xl shadow-lg bg-white dark:bg-gray-700 ring-1 ring-black/5 dark:ring-white/10 overflow-hidden z-50"
                                                    >
                                                        <div role="menu" aria-orientation="vertical">
                                                            <button
                                                                onClick={() => handleRemoveFromRecent(project.timestamp)}
                                                                className="w-full text-left block px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                                                                role="menuitem"
                                                            >
                                                                Remove from recent
                                                            </button>
                                                            <div className="mx-3 border-t border-gray-100 dark:border-gray-600" />
                                                            <button
                                                                onClick={() => handleDeleteProject(project)}
                                                                className="w-full text-left block px-4 py-2.5 text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                                                role="menuitem"
                                                            >
                                                                Delete permanently
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                                {filteredProjects.length > MAX_RECENT_PROJECTS && !isRecentProjectsExpanded && (
                                    <div className="p-3 text-center border-t border-gray-100 dark:border-gray-700/50">
                                        <button
                                            onClick={() => setIsRecentProjectsExpanded(true)}
                                            className="text-sm text-[#007D8C] hover:text-[#006b7a] font-medium transition-colors duration-200"
                                        >
                                            Show More
                                        </button>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="text-center py-14 px-6">
                                <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center mx-auto mb-3">
                                    <FolderOpenIcon className="h-6 w-6 text-gray-300 dark:text-gray-500" />
                                </div>
                                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                                    {searchTerm ? 'No matching projects' : 'No Recent Projects'}
                                </h3>
                                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                                    {searchTerm ? 'Try adjusting your search.' : 'Projects you save or open will appear here.'}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </main>
            <footer className="text-center text-gray-400 dark:text-gray-500 text-xs py-6">
                X-TES Digital Reporting v1.1.4
            </footer>
            {showWhatsNew && (
                <WhatsNewModal onClose={() => setShowWhatsNew(false)} />
            )}
        </div>
    );
};

export default LandingPage;
