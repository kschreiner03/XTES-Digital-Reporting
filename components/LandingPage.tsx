import React, { useState, useEffect, useMemo } from 'react';
import { DocumentTextIcon, CameraIcon, ClipboardDocumentListIcon, SearchIcon, FolderOpenIcon, EllipsisVerticalIcon, DocumentDuplicateIcon } from './icons';
import { AppType } from '../App';
import { deleteImage, deleteProject, retrieveProject } from './db';

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
        default:
            return 'Report';
    }
};


const AppSelectionCard: React.FC<{ title: string; description: string; icon: React.ReactNode; onClick: () => void; }> = ({ title, description, icon, onClick }) => (
    <div 
        onClick={onClick}
        className="bg-gray-50 hover:bg-white p-6 rounded-lg border border-gray-200 hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col items-center text-center"
        role="button"
        tabIndex={0}
        onKeyPress={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
        aria-label={`Select ${title}`}
    >
        <div className="text-[#007D8C] mb-4">
            {icon}
        </div>
        <h3 className="text-xl font-bold text-gray-800 mb-2">{title}</h3>
        <p className="text-gray-600 text-sm">{description}</p>
    </div>
);

const LandingPage: React.FC<LandingPageProps> = ({ onSelectApp, onOpenProject, isUpdateAvailable }) => {
    const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [openMenuTimestamp, setOpenMenuTimestamp] = useState<number | null>(null);
    const [isRecentProjectsExpanded, setIsRecentProjectsExpanded] = useState(false);
    const [updateNotificationDismissed, setUpdateNotificationDismissed] = useState(false);

    useEffect(() => {
        setRecentProjects(getRecentProjects());
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

    const handleRemoveFromRecent = (timestamp: number) => {
        const updatedProjects = recentProjects.filter(p => p.timestamp !== timestamp);
        localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updatedProjects));
        setRecentProjects(updatedProjects);
        setOpenMenuTimestamp(null);
    };

    const handleDeleteProject = async (projectToDelete: RecentProject) => {
        if (!window.confirm(`Are you sure you want to permanently delete "${projectToDelete.name || 'Untitled Project'}"? This action cannot be undone.`)) {
            setOpenMenuTimestamp(null);
            return;
        }

        // 1. Remove from recent list in localStorage
        const updatedProjects = recentProjects.filter(p => p.timestamp !== projectToDelete.timestamp);
        localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updatedProjects));
        setRecentProjects(updatedProjects);

        // 2. Delete associated images from IndexedDB by first retrieving the project data
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

        // 3. Delete the project itself from IndexedDB
        try {
            await deleteProject(projectToDelete.timestamp);
        } catch(e) {
            console.error("Failed to delete project from DB:", e);
        }
        
        setOpenMenuTimestamp(null);
    };
    
    const projectsToShow = isRecentProjectsExpanded ? filteredProjects : filteredProjects.slice(0, MAX_RECENT_PROJECTS);


    return (
        <div className="bg-gray-100 min-h-screen">
            {isUpdateAvailable && !updateNotificationDismissed && (
                <div className="bg-teal-100 border-l-4 border-teal-500 text-teal-700 p-4 relative" role="alert">
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
                        <svg className="fill-current h-6 w-6 text-teal-500" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><title>Close</title><path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z"/></svg>
                    </button>
                </div>
            )}
            <header className="relative h-96 bg-black">
                <img 
                    src="https://ik.imagekit.io/fzpijprte/oil%20wells%20prairie_CL.jpg?updatedAt=1760723960968" 
                    alt="Oil field landscape"
                    className="w-full h-full object-cover saturate-150"
                    style={{ objectPosition: 'center 85%' }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-gray-100 to-transparent"></div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="bg-white rounded-lg shadow-xl p-8 md:p-12">
                    <div className="text-center border-b border-gray-200 pb-8">
                        <img
                            src="https://ik.imagekit.io/fzpijprte/XTerraLogo2019_Horizontal.jpg?updatedAt=1758827714962"
                            alt="X-TERRA Logo"
                            className="h-16 w-auto mx-auto mb-4"
                        />
                        <h1 className="text-3xl font-extrabold text-gray-800 sm:text-4xl">
                            Create a New Report
                        </h1>
                        <p className="mt-3 text-lg text-gray-600 max-w-2xl mx-auto">
                            Select a report type to begin a new project from scratch.
                        </p>
                    </div>

                    <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                        <AppSelectionCard 
                            title="Photographic Log"
                            description="Create and edit photographic logs with project details and image uploads."
                            icon={<CameraIcon className="h-16 w-16" />}
                            onClick={() => onSelectApp('photoLog')}
                        />
                        <AppSelectionCard 
                            title="Daily field Report"
                            description="A standard Daily Field Report for general project documentation."
                            icon={<DocumentTextIcon className="h-16 w-16" />}
                            onClick={() => onSelectApp('dfrStandard')}
                        />
                        <AppSelectionCard 
                            title="Sask Power Daily Field Report"
                            description="Daily Field Report tailored for SaskPower projects."
                            icon={<ClipboardDocumentListIcon className="h-16 w-16" />}
                            onClick={() => onSelectApp('dfrSaskpower')}
                        />
                         <AppSelectionCard 
                            title="Combine Logs"
                            description="Combine photos from multiple reports into a single, comprehensive photo log."
                            icon={<DocumentDuplicateIcon className="h-16 w-16" />}
                            onClick={() => onSelectApp('combinedLog')}
                        />
                    </div>
                </div>

                <div className="mt-16">
                    <div className="text-center mb-8">
                         <h2 className="text-3xl font-extrabold text-gray-800 sm:text-4xl">
                            Recent Projects
                        </h2>
                        <p className="mt-3 text-lg text-gray-600 max-w-2xl mx-auto">
                           Continue working on a previously saved report. Your projects are stored in this browser.
                        </p>
                    </div>

                    <div className="max-w-xl mx-auto mb-6">
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <SearchIcon className="text-gray-400" />
                            </div>
                            <input
                                type="search"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search by project name or number..."
                                className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-[#007D8C] focus:border-[#007D8C] sm:text-sm"
                            />
                        </div>
                    </div>
                    
                    <div className="bg-white rounded-lg shadow-xl">
                        {filteredProjects.length > 0 ? (
                            <>
                                <ul className="divide-y divide-gray-200">
                                    {projectsToShow.map((project) => (
                                        <li key={project.timestamp} className={`relative ${openMenuTimestamp === project.timestamp ? 'z-20' : 'z-auto'}`}>
                                            <button onClick={() => onOpenProject(project)} className="w-full text-left block hover:bg-gray-50 focus:outline-none focus:bg-gray-100 transition duration-150 ease-in-out pr-12">
                                                <div className="px-4 py-4 sm:px-6 flex items-center justify-between">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-lg font-semibold text-[#007D8C] truncate">
                                                            {project.name || 'Untitled Project'}
                                                        </p>
                                                        <div className="mt-1 text-sm text-gray-500 flex flex-wrap items-center gap-x-2">
                                                            <span className="font-medium text-gray-700 bg-gray-200 px-2 py-0.5 rounded-full">{getReportTypeName(project.type)}</span>
                                                            <span className="text-gray-300 hidden sm:inline">|</span>
                                                            <span>Project #: {project.projectNumber || 'N/A'}</span>
                                                            <span className="text-gray-300 hidden sm:inline">|</span>
                                                            <span>Last updated: {new Date(project.timestamp).toLocaleDateString()}</span>
                                                        </div>
                                                    </div>
                                                    <div className="ml-4 flex-shrink-0">
                                                        <FolderOpenIcon className="h-7 w-7 text-gray-400" />
                                                    </div>
                                                </div>
                                            </button>
                                            <div className="absolute top-1/2 right-4 -translate-y-1/2">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setOpenMenuTimestamp(openMenuTimestamp === project.timestamp ? null : project.timestamp);
                                                    }}
                                                    className="p-1 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#007D8C]"
                                                    aria-haspopup="true"
                                                    aria-expanded={openMenuTimestamp === project.timestamp}
                                                >
                                                    <EllipsisVerticalIcon className="h-6 w-6" />
                                                </button>
                                                 {openMenuTimestamp === project.timestamp && (
                                                    <div 
                                                        className="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-10"
                                                        onMouseLeave={() => setOpenMenuTimestamp(null)}
                                                    >
                                                        <div className="py-1" role="menu" aria-orientation="vertical">
                                                            <button
                                                                onClick={() => handleRemoveFromRecent(project.timestamp)}
                                                                className="w-full text-left block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                                                role="menuitem"
                                                            >
                                                                Remove from recent
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteProject(project)}
                                                                className="w-full text-left block px-4 py-2 text-sm text-red-600 hover:bg-red-50"
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
                                    <div className="p-4 text-center border-t border-gray-200">
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
                                <h3 className="text-lg font-medium text-gray-900">No Recent Projects Found</h3>
                                <p className="mt-1 text-sm text-gray-500">
                                    {searchTerm ? 'Try adjusting your search.' : 'Projects you save or open will appear here.'}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </main>
            <footer className="text-center text-gray-500 text-sm py-4">
                X-TES Digital Reporting v1.0.2
            </footer>
        </div>
    );
};

export default LandingPage;