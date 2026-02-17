
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { StandardDfrIcon, CameraIcon, SaskPowerIcon, SearchIcon, FolderOpenIcon, EllipsisVerticalIcon, DocumentDuplicateIcon } from './icons';
import { AppType } from '../App';
import { deleteImage, deleteProject, deleteThumbnail, retrieveProject, getAllThumbnails } from './db';
import SafeImage from './SafeImage';
import ProjectPreviewTooltip from './ProjectPreviewTooltip';

export interface RecentProject {
    type: AppType;
    name: string;
    projectNumber: string;
    timestamp: number; // Used as project ID
}

interface LandingPageProps {
  onSelectApp: (app: AppType) => void;
  onOpenProject: (project: RecentProject) => void;
  isUpdateAvailable: boolean;
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
        case 'iogcLeaseAudit':
            return 'IOGC Lease Audit';
        default:
            return 'Report';
    }
};


const AppSelectionCard: React.FC<{ title: string; description: string; icon: React.ReactNode; onClick: () => void; }> = ({ title, description, icon, onClick }) => (
    <div 
        onClick={onClick}
        className="bg-gray-50 dark:bg-gray-800 hover:bg-white dark:hover:bg-gray-700 p-6 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col items-center text-center group"
        role="button"
        tabIndex={0}
        onKeyPress={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
        aria-label={`Select ${title}`}
    >
        <div className="text-[#007D8C] mb-4 group-hover:scale-110 transition-transform duration-300">
            {icon}
        </div>
        <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">{title}</h3>
        <p className="text-gray-600 dark:text-gray-400 text-sm">{description}</p>
    </div>
);

const LandingPage: React.FC<LandingPageProps> = ({ onSelectApp, onOpenProject, isUpdateAvailable }) => {
    const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [openMenuTimestamp, setOpenMenuTimestamp] = useState<number | null>(null);
    const [isRecentProjectsExpanded, setIsRecentProjectsExpanded] = useState(false);
    const [updateNotificationDismissed, setUpdateNotificationDismissed] = useState(false);
    const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());
    const [hoveredTimestamp, setHoveredTimestamp] = useState<number | null>(null);
    const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        setRecentProjects(getRecentProjects());

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

        return () => {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        };
    }, []);

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
        <div className="bg-gray-100 dark:bg-gray-900 min-h-screen transition-colors duration-200">
            {isUpdateAvailable && !updateNotificationDismissed && (
                <div className="bg-teal-100 dark:bg-teal-900 border-l-4 border-teal-500 text-teal-700 dark:text-teal-200 p-4 relative" role="alert">
                    <div className="flex items-center">
                        <div className="py-1">
                            <svg className="fill-current h-6 w-6 text-teal-500 mr-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M2.93 17.07A10 10 0 1 1 17.07 2.93 10 10 0 0 1 2.93 17.07zm12.73-1.41A8 8 0 1 0 4.34 4.34a8 8 0 0 0 11.32 11.32zM9 11V9h2v6H9v-4zm0-6h2v2H9V5z"/></svg>
                        </div>
                        <div>
                            <p className="font-bold">A new update is available!</p>
                            <p className="text-sm">The download has started and will be installed automatically when you quit and restart the application.</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setUpdateNotificationDismissed(true)}
                        className="absolute top-0 bottom-0 right-0 px-4 py-3"
                        aria-label="Dismiss"
                    >
                        <svg className="fill-current h-6 w-6 text-teal-500" role="button" xmlns="http://www.w3.org/2000/svg"><title>Close</title><path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z"/></svg>
                    </button>
                </div>
            )}
            <header className="relative h-96 bg-black">
                <SafeImage 
                    fileName="landscape.jpg" 
                    alt="Oil field landscape"
                    className="w-full h-full object-cover saturate-150 opacity-90 dark:opacity-75"
                    style={{ objectPosition: 'center 85%' }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-gray-100 dark:from-gray-900 to-transparent"></div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 -mt-20 relative z-10">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8 md:p-12 mb-10 transition-colors duration-200">
                    <div className="text-center border-b border-gray-200 dark:border-gray-700 pb-8">
                        <SafeImage
                            fileName="xterra-logo.jpg"
                            alt="X-TERRA Logo"
                            className="h-16 w-auto mx-auto mb-4 mix-blend-multiply dark:mix-blend-normal dark:bg-white dark:p-1 dark:rounded"
                        />
                        <h1 className="text-3xl font-extrabold text-gray-800 dark:text-white sm:text-4xl">
                            Create a New Report
                        </h1>
                        <p className="mt-3 text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
                            Select a report type to begin a new project from scratch.
                        </p>
                    </div>

                    <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <AppSelectionCard 
                            title="Photographic Log"
                            description="Create and edit photographic logs."
                            icon={<CameraIcon className="h-12 w-12" />}
                            onClick={() => onSelectApp('photoLog')}
                        />
                        <AppSelectionCard 
                            title="Daily Field Report"
                            description="Standard DFR for project documentation."
                            icon={<StandardDfrIcon className="h-12 w-12" />}
                            onClick={() => onSelectApp('dfrStandard')}
                        />
                        <AppSelectionCard 
                            title="SaskPower DFR"
                            description="DFR tailored for SaskPower projects."
                            icon={<SaskPowerIcon className="h-12 w-12" />}
                            onClick={() => onSelectApp('dfrSaskpower')}
                        />
                         <AppSelectionCard 
                            title="Combine Logs"
                            description="Merge photos from multiple reports."
                            icon={<DocumentDuplicateIcon className="h-12 w-12" />}
                            onClick={() => onSelectApp('combinedLog')}
                        />
                    </div>
                </div>

                <div className="mt-16">
                    <div className="text-center mb-8">
                         <h2 className="text-3xl font-extrabold text-gray-800 dark:text-white sm:text-4xl">
                            Recent Projects
                        </h2>
                        <p className="mt-3 text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                           Continue working on a previously saved report. Your projects are stored in this browser.
                        </p>
                    </div>

                    <div className="max-w-xl mx-auto mb-6">
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <SearchIcon className="text-gray-400 dark:text-gray-500" />
                            </div>
                            <input
                                type="search"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search by project name or number..."
                                className="block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-800 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-[#007D8C] focus:border-[#007D8C] sm:text-sm shadow-sm transition-colors duration-200"
                            />
                        </div>
                    </div>
                    
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-visible transition-colors duration-200">
                        {filteredProjects.length > 0 ? (
                            <>
                                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {projectsToShow.map((project) => (
                                        <li
                                            key={project.timestamp}
                                            className={`relative ${openMenuTimestamp === project.timestamp ? 'z-50' : 'z-auto'}`}
                                            onMouseEnter={() => handleMouseEnter(project.timestamp)}
                                            onMouseLeave={handleMouseLeave}
                                        >
                                            <ProjectPreviewTooltip
                                                thumbnailUrl={thumbnails.get(project.timestamp) || null}
                                                visible={hoveredTimestamp === project.timestamp && openMenuTimestamp !== project.timestamp}
                                            />
                                            <button onClick={() => onOpenProject(project)} className="w-full text-left block hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:bg-gray-100 dark:focus:bg-gray-700 transition duration-150 ease-in-out pr-12">
                                                <div className="px-4 py-4 sm:px-6 flex items-center justify-between">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-lg font-semibold text-[#007D8C] truncate">
                                                            {project.name || 'Untitled Project'}
                                                        </p>
                                                        <div className="mt-1 text-sm text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-x-2">
                                                            <span className="font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded-full">{getReportTypeName(project.type)}</span>
                                                            <span className="text-gray-300 dark:text-gray-600 hidden sm:inline">|</span>
                                                            <span>Project #: {project.projectNumber || 'N/A'}</span>
                                                            <span className="text-gray-300 dark:text-gray-600 hidden sm:inline">|</span>
                                                            <span>Last updated: {new Date(project.timestamp).toLocaleDateString()}</span>
                                                        </div>
                                                    </div>
                                                    <div className="ml-4 flex-shrink-0">
                                                        <FolderOpenIcon className="h-7 w-7 text-gray-400 dark:text-gray-500" />
                                                    </div>
                                                </div>
                                            </button>
                                            <div className="absolute top-1/2 right-4 -translate-y-1/2">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setOpenMenuTimestamp(openMenuTimestamp === project.timestamp ? null : project.timestamp);
                                                    }}
                                                    className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#007D8C]"
                                                    aria-haspopup="true"
                                                    aria-expanded={openMenuTimestamp === project.timestamp}
                                                >
                                                    <EllipsisVerticalIcon className="h-6 w-6" />
                                                </button>
                                                 {openMenuTimestamp === project.timestamp && (
                                                    <div 
                                                        className="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white dark:bg-gray-700 ring-1 ring-black ring-opacity-5 focus:outline-none z-50"
                                                        onMouseLeave={() => setOpenMenuTimestamp(null)}
                                                    >
                                                        <div className="py-1" role="menu" aria-orientation="vertical">
                                                            <button
                                                                onClick={() => handleRemoveFromRecent(project.timestamp)}
                                                                className="w-full text-left block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                                                                role="menuitem"
                                                            >
                                                                Remove from recent
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteProject(project)}
                                                                className="w-full text-left block px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                                                                role="menuitem"
                                                            >
                                                                Delete project permanently
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                                {filteredProjects.length > MAX_RECENT_PROJECTS && (
                                    <div className="p-4 text-center border-t border-gray-200 dark:border-gray-700">
                                        <button
                                            onClick={() => setIsRecentProjectsExpanded(!isRecentProjectsExpanded)}
                                            className="text-[#007D8C] hover:text-[#006b7a] font-semibold transition-colors duration-200"
                                        >
                                            {isRecentProjectsExpanded ? 'Show Less' : 'Show More'}
                                        </button>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="text-center py-12 px-6">
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">No Recent Projects Found</h3>
                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                    {searchTerm ? 'Try adjusting your search.' : 'Projects you save or open will appear here.'}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </main>
            <footer className="text-center text-gray-500 dark:text-gray-400 text-sm py-4">
                X-TES Digital Reporting v1.1.4
            </footer>
        </div>
    );
};

export default LandingPage;