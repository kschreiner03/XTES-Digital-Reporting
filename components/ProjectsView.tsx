import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CloseIcon, FolderOpenIcon, SearchIcon, TrashIcon, SaveIcon, DownloadIcon, DocumentDuplicateIcon } from './icons';
import { AppType } from '../App';
import { RecentProject, ProjectStatus } from './LandingPage';
import { deleteImage, deleteProject, deleteThumbnail, retrieveProject, retrieveThumbnail, storeProject, storeThumbnail } from './db';
import { safeSet } from './safeStorage';
import ConfirmModal from './ConfirmModal';
import { toast } from './Toast';

const RECENT_PROJECTS_KEY = 'xtec_recent_projects';
const FOLDERS_KEY = 'xtec_project_folders';
const VIEW_MODE_KEY = 'xtec_projects_view_mode';

const EXT_MAP: Record<AppType, string> = {
    photoLog: 'plog',
    dfrStandard: 'dfr',
    dfrSaskpower: 'spdfr',
    combinedLog: 'clog',
};

interface ProjectsViewProps {
    onClose: () => void;
    onOpenProject: (project: RecentProject) => void;
    onRequestPdfExport: (project: RecentProject) => void;
}

interface FolderNode {
    name: string;
    path: string;
    children: FolderNode[];
}

const getRecentProjects = (): RecentProject[] => {
    try { return JSON.parse(localStorage.getItem(RECENT_PROJECTS_KEY) || '[]'); } catch { return []; }
};
const saveProjects = (p: RecentProject[]) => safeSet(RECENT_PROJECTS_KEY, JSON.stringify(p));
const getFolders = (): string[] => {
    try { return JSON.parse(localStorage.getItem(FOLDERS_KEY) || '[]'); } catch { return []; }
};
const saveFolders = (f: string[]) => localStorage.setItem(FOLDERS_KEY, JSON.stringify(f));

function buildTree(folders: string[]): FolderNode[] {
    const nodes: Record<string, FolderNode> = {};
    const roots: FolderNode[] = [];
    const sorted = [...folders].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
    for (const path of sorted) {
        const parts = path.split('/');
        const name = parts[parts.length - 1];
        const node: FolderNode = { name, path, children: [] };
        nodes[path] = node;
        if (parts.length === 1) {
            roots.push(node);
        } else {
            const parentPath = parts.slice(0, -1).join('/');
            if (nodes[parentPath]) nodes[parentPath].children.push(node);
            else roots.push(node); // orphan — parent was deleted
        }
    }
    return roots;
}

const getReportTypeName = (type: AppType) => {
    switch (type) {
        case 'photoLog': return 'Photo Log';
        case 'dfrStandard': return 'Daily Field Report';
        case 'dfrSaskpower': return 'SaskPower DFR';
        case 'combinedLog': return 'Combined Log';
        default: return 'Report';
    }
};

const STATUS_CONFIG: Record<ProjectStatus, { label: string; className: string }> = {
    draft:     { label: 'Draft',     className: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
    review:    { label: 'In Review', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300' },
    final:     { label: 'Final',     className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
    submitted: { label: 'Submitted', className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
};

const TYPE_COLOR: Record<AppType, string> = {
    photoLog:    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    dfrStandard: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    dfrSaskpower:'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    combinedLog: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
};

// ─── Folder tree sidebar node ────────────────────────────────────────────────
const FolderTreeNode: React.FC<{
    node: FolderNode;
    selectedFolder: string | null;
    expandedFolders: Set<string>;
    projectCounts: Record<string, number>;
    onSelect: (path: string) => void;
    onToggleExpand: (path: string) => void;
    onDelete: (path: string) => void;
    depth: number;
}> = ({ node, selectedFolder, expandedFolders, projectCounts, onSelect, onToggleExpand, onDelete, depth }) => {
    const isExpanded = expandedFolders.has(node.path);
    const isActive = selectedFolder === node.path;
    const count = projectCounts[node.path] || 0;
    const hasChildren = node.children.length > 0;

    return (
        <div>
            <div className="group relative flex items-center" style={{ paddingLeft: `${depth * 12}px` }}>
                {hasChildren && (
                    <button onClick={() => onToggleExpand(node.path)} className="p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex-shrink-0">
                        <svg className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                    </button>
                )}
                {!hasChildren && <div className="w-4 flex-shrink-0" />}
                <button
                    onClick={() => onSelect(node.path)}
                    className={`flex-1 text-left px-2 py-1.5 rounded-lg text-sm font-medium flex items-center justify-between gap-1 min-w-0 transition-colors ${isActive ? 'bg-[#007D8C] text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                >
                    <span className="flex items-center gap-1.5 min-w-0">
                        <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                        </svg>
                        <span className="truncate">{node.name}</span>
                    </span>
                    <span className={`text-[10px] rounded-full px-1.5 py-0.5 flex-shrink-0 ${isActive ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-300'}`}>{count}</span>
                </button>
                <button onClick={() => onDelete(node.path)} className="p-1 rounded text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0" title="Delete folder">
                    <TrashIcon className="h-3 w-3" />
                </button>
            </div>
            {isExpanded && node.children.map(child => (
                <FolderTreeNode key={child.path} node={child} selectedFolder={selectedFolder} expandedFolders={expandedFolders} projectCounts={projectCounts} onSelect={onSelect} onToggleExpand={onToggleExpand} onDelete={onDelete} depth={depth + 1} />
            ))}
        </div>
    );
};

// ─── Main component ───────────────────────────────────────────────────────────
const ProjectsView: React.FC<ProjectsViewProps> = ({ onClose, onOpenProject, onRequestPdfExport }) => {
    const [projects, setProjects] = useState<RecentProject[]>([]);
    const [folders, setFolders] = useState<string[]>([]);
    const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
    const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => (localStorage.getItem(VIEW_MODE_KEY) as 'grid' | 'list') || 'grid');
    const [confirmDelete, setConfirmDelete] = useState<RecentProject | null>(null);
    const [contextMenu, setContextMenu] = useState<{ project: RecentProject; x: number; y: number } | null>(null);
    const [contextSubmenu, setContextSubmenu] = useState<'folder' | 'status' | null>(null);
    const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [newFolderParent, setNewFolderParent] = useState('');
    const [exporting, setExporting] = useState<number | null>(null);
    const contextMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const loaded = getRecentProjects();
        setProjects(loaded);
        setFolders(getFolders());
        loaded.forEach(async (p) => {
            try {
                const thumb = await retrieveThumbnail(p.timestamp);
                if (thumb) setThumbnails(prev => ({ ...prev, [p.timestamp]: thumb }));
            } catch { /* no thumbnail */ }
        });
    }, []);

    useEffect(() => {
        if (!contextMenu) return;
        const handler = (e: MouseEvent) => {
            if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
                setContextMenu(null); setContextSubmenu(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [contextMenu]);

    const folderTree = useMemo(() => buildTree(folders), [folders]);

    const projectCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const p of projects) {
            if (!p.folder) continue;
            // Count for exact folder and all ancestor paths
            const parts = p.folder.split('/');
            for (let i = 1; i <= parts.length; i++) {
                const path = parts.slice(0, i).join('/');
                counts[path] = (counts[path] || 0) + 1;
            }
        }
        return counts;
    }, [projects, folders]);

    const filteredProjects = useMemo(() => {
        let list = projects;
        if (selectedFolder !== null) {
            if (selectedFolder === '') {
                list = list.filter(p => !p.folder);
            } else {
                // Show exact folder only (not subfolders) — matches file-explorer behaviour
                list = list.filter(p => p.folder === selectedFolder);
            }
        }
        if (searchTerm.trim()) {
            const t = searchTerm.toLowerCase();
            list = list.filter(p => p.name.toLowerCase().includes(t) || p.projectNumber.toLowerCase().includes(t));
        }
        return list;
    }, [projects, selectedFolder, searchTerm]);

    const updateProjects = (updated: RecentProject[]) => { setProjects(updated); saveProjects(updated); };

    const handleToggleExpand = (path: string) => {
        setExpandedFolders(prev => {
            const next = new Set(prev);
            next.has(path) ? next.delete(path) : next.add(path);
            return next;
        });
    };

    const handleCreateFolder = () => {
        const name = newFolderName.trim();
        if (!name) { setNewFolderDialogOpen(false); return; }
        const path = newFolderParent ? `${newFolderParent}/${name}` : name;
        if (folders.includes(path)) { toast('A folder with that name already exists.', 'error'); return; }
        const updated = [...folders, path];
        setFolders(updated); saveFolders(updated);
        if (newFolderParent) setExpandedFolders(prev => new Set([...prev, newFolderParent]));
        setNewFolderDialogOpen(false); setNewFolderName(''); setNewFolderParent('');
        setSelectedFolder(path);
    };

    const handleDeleteFolder = (path: string) => {
        // Remove folder and all sub-folders, unfile their projects
        const toRemove = folders.filter(f => f === path || f.startsWith(path + '/'));
        updateProjects(projects.map(p => toRemove.includes(p.folder || '') ? { ...p, folder: undefined } : p));
        setFolders(folders.filter(f => !toRemove.includes(f)));
        saveFolders(folders.filter(f => !toRemove.includes(f)));
        if (selectedFolder && toRemove.includes(selectedFolder)) setSelectedFolder(null);
    };

    const handleMoveToFolder = (project: RecentProject, folder: string | undefined) => {
        updateProjects(projects.map(p => p.timestamp === project.timestamp ? { ...p, folder } : p));
        setContextMenu(null); setContextSubmenu(null);
    };

    const handleSetStatus = (project: RecentProject, status: ProjectStatus | undefined) => {
        updateProjects(projects.map(p => p.timestamp === project.timestamp ? { ...p, status } : p));
        setContextMenu(null); setContextSubmenu(null);
    };

    const handleDeleteProject = async (project: RecentProject) => {
        setConfirmDelete(null);
        updateProjects(projects.filter(p => p.timestamp !== project.timestamp));
        try {
            const data = await retrieveProject(project.timestamp);
            if (data?.photosData) for (const photo of data.photosData) if (photo.imageId) await deleteImage(photo.imageId);
        } catch { /* ignore */ }
        try { await deleteProject(project.timestamp); } catch { /* ignore */ }
        try { await deleteThumbnail(project.timestamp); } catch { /* ignore */ }
    };

    const handleDuplicate = async (project: RecentProject) => {
        setContextMenu(null); setContextSubmenu(null);
        try {
            const data = await retrieveProject(project.timestamp);
            if (!data) { toast('Could not duplicate — project data not found.', 'error'); return; }
            const newTs = Date.now();
            await storeProject(newTs, data);
            const thumb = thumbnails[project.timestamp];
            if (thumb) { await storeThumbnail(newTs, thumb); setThumbnails(prev => ({ ...prev, [newTs]: thumb })); }
            const dup: RecentProject = { ...project, name: project.name ? `${project.name} (Copy)` : 'Copy', timestamp: newTs, status: 'draft' };
            updateProjects([dup, ...projects]);
            toast('Project duplicated.', 'success');
        } catch { toast('Failed to duplicate project.', 'error'); }
    };

    const handleExportFile = async (project: RecentProject) => {
        setContextMenu(null); setContextSubmenu(null);
        setExporting(project.timestamp);
        try {
            const data = await retrieveProject(project.timestamp);
            if (!data) { toast('Could not export — project data not found.', 'error'); return; }
            const photosForExport = data.photosData ? data.photosData.map(({ imageId, ...rest }: any) => rest) : data.photosData;
            const exportData = { ...data, photosData: photosForExport };
            const ext = EXT_MAP[project.type] || 'json';
            const filename = `${project.projectNumber || project.name || 'project'}_${project.name || ''}.${ext}`.replace(/\s+/g, '_');
            const json = JSON.stringify(exportData);
            // @ts-ignore
            if (window.electronAPI?.saveProject) { // @ts-ignore
                await window.electronAPI.saveProject(json, filename);
            } else {
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
                URL.revokeObjectURL(url);
            }
            toast('Project exported.', 'success');
        } catch { toast('Failed to export project.', 'error'); }
        finally { setExporting(null); }
    };

    const handleContextMenu = (e: React.MouseEvent, project: RecentProject) => {
        e.preventDefault();
        setContextMenu({ project, x: Math.min(e.clientX, window.innerWidth - 230), y: Math.min(e.clientY, window.innerHeight - 340) });
        setContextSubmenu(null);
    };

    const setView = (mode: 'grid' | 'list') => { setViewMode(mode); localStorage.setItem(VIEW_MODE_KEY, mode); };

    const breadcrumb = useMemo(() => {
        if (selectedFolder === null) return null;
        if (selectedFolder === '') return [{ label: 'Unfiled', path: '' }];
        return selectedFolder.split('/').map((part, i, arr) => ({ label: part, path: arr.slice(0, i + 1).join('/') }));
    }, [selectedFolder]);

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-900 xtec-modal-enter">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
                <div className="flex items-center gap-3">
                    <FolderOpenIcon className="h-5 w-5 text-[#007D8C]" />
                    <h1 className="text-lg font-bold text-gray-900 dark:text-white">Projects</h1>
                    <span className="text-sm text-gray-400">({projects.length})</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input type="search" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search..." className="pl-9 pr-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#007D8C]/50 w-48" />
                    </div>
                    {/* View mode toggle */}
                    <div className="flex items-center border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                        <button onClick={() => setView('grid')} title="Grid view" className={`p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-[#007D8C] text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25A2.25 2.25 0 0113.5 8.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>
                        </button>
                        <button onClick={() => setView('list')} title="List view" className={`p-1.5 transition-colors ${viewMode === 'list' ? 'bg-[#007D8C] text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                        </button>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white transition-colors ml-1">
                        <CloseIcon className="h-6 w-6" />
                    </button>
                </div>
            </div>

            <div className="flex flex-1 min-h-0">
                {/* Sidebar */}
                <div className="w-56 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex flex-col">
                    <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
                        {/* All Projects */}
                        <button onClick={() => setSelectedFolder(null)} className={`w-full text-left px-3 py-1.5 rounded-lg text-sm font-medium flex items-center justify-between transition-colors ${selectedFolder === null ? 'bg-[#007D8C] text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                            <span className="flex items-center gap-2"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>All Projects</span>
                            <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${selectedFolder === null ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-600 text-gray-500'}`}>{projects.length}</span>
                        </button>
                        {/* Unfiled */}
                        <button onClick={() => setSelectedFolder('')} className={`w-full text-left px-3 py-1.5 rounded-lg text-sm font-medium flex items-center justify-between transition-colors ${selectedFolder === '' ? 'bg-[#007D8C] text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                            <span className="flex items-center gap-2"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>Unfiled</span>
                            <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${selectedFolder === '' ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-600 text-gray-500'}`}>{projects.filter(p => !p.folder).length}</span>
                        </button>

                        {folderTree.length > 0 && (
                            <div className="pt-2">
                                <p className="px-3 text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">Folders</p>
                                {folderTree.map(node => (
                                    <FolderTreeNode key={node.path} node={node} selectedFolder={selectedFolder} expandedFolders={expandedFolders} projectCounts={projectCounts} onSelect={setSelectedFolder} onToggleExpand={handleToggleExpand} onDelete={handleDeleteFolder} depth={0} />
                                ))}
                            </div>
                        )}
                    </nav>
                    <div className="p-2 border-t border-gray-200 dark:border-gray-700">
                        <button onClick={() => { setNewFolderName(''); setNewFolderParent(selectedFolder && selectedFolder !== '' ? selectedFolder : ''); setNewFolderDialogOpen(true); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#007D8C] hover:bg-[#007D8C]/10 rounded-lg transition-colors font-medium">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                            New Folder
                        </button>
                    </div>
                </div>

                {/* Main */}
                <div className="flex-1 min-w-0 flex flex-col">
                    {/* Breadcrumb */}
                    {breadcrumb && (
                        <div className="px-5 py-2 border-b border-gray-100 dark:border-gray-700 flex items-center gap-1.5 text-sm flex-shrink-0">
                            <button onClick={() => setSelectedFolder(null)} className="text-[#007D8C] hover:underline">All Projects</button>
                            {breadcrumb.map((crumb, i) => (
                                <React.Fragment key={crumb.path}>
                                    <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                                    <button onClick={() => setSelectedFolder(crumb.path)} className={i === breadcrumb.length - 1 ? 'font-semibold text-gray-800 dark:text-white' : 'text-[#007D8C] hover:underline'}>{crumb.label}</button>
                                </React.Fragment>
                            ))}
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto p-5">
                        {filteredProjects.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center">
                                <FolderOpenIcon className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" />
                                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400">{searchTerm ? 'No matching projects' : 'No projects here'}</h3>
                                <p className="text-xs text-gray-400 mt-1">{searchTerm ? 'Try a different search.' : 'Right-click a project to move it into this folder.'}</p>
                            </div>
                        ) : viewMode === 'grid' ? (
                            // ── Grid view ──────────────────────────────────────────
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                                {filteredProjects.map(project => (
                                    <div key={project.timestamp} onContextMenu={e => handleContextMenu(e, project)} onClick={() => onOpenProject(project)} className="group relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:border-[#007D8C]/40 transition-all cursor-pointer flex flex-col">
                                        <div className="h-28 bg-gray-100 dark:bg-gray-700 flex items-center justify-center overflow-hidden relative flex-shrink-0">
                                            {thumbnails[project.timestamp] ? <img src={thumbnails[project.timestamp]} alt="" className="w-full h-full object-cover" /> : <FolderOpenIcon className="h-8 w-8 text-gray-300 dark:text-gray-600" />}
                                            {exporting === project.timestamp && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><span className="text-white text-xs font-medium">Exporting...</span></div>}
                                            {project.status && <span className={`absolute top-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md ${STATUS_CONFIG[project.status].className}`}>{STATUS_CONFIG[project.status].label}</span>}
                                        </div>
                                        <div className="p-2.5 flex flex-col flex-1">
                                            <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{project.name || 'Untitled'}</p>
                                            <p className="text-[10px] text-gray-400 mt-0.5">#{project.projectNumber || 'N/A'}</p>
                                            <div className="mt-1.5 flex items-center justify-between">
                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${TYPE_COLOR[project.type]}`}>{getReportTypeName(project.type)}</span>
                                                <span className="text-[9px] text-gray-400">{new Date(project.timestamp).toLocaleDateString()}</span>
                                            </div>
                                            {project.folder && <p className="text-[9px] text-[#007D8C] mt-1 truncate">📁 {project.folder.split('/').pop()}</p>}
                                        </div>
                                        <div className="absolute inset-0 bg-[#007D8C]/0 group-hover:bg-[#007D8C]/5 transition-colors pointer-events-none rounded-xl" />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            // ── List view ───────────────────────────────────────────
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-200 dark:border-gray-700">
                                        <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                                        <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</th>
                                        <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                                        <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Folder</th>
                                        <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredProjects.map(project => (
                                        <tr key={project.timestamp} onContextMenu={e => handleContextMenu(e, project)} onClick={() => onOpenProject(project)} className="border-b border-gray-100 dark:border-gray-800 hover:bg-[#007D8C]/5 dark:hover:bg-[#007D8C]/10 cursor-pointer transition-colors group">
                                            <td className="py-2.5 px-3">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-md overflow-hidden bg-gray-100 dark:bg-gray-700 flex-shrink-0">
                                                        {thumbnails[project.timestamp] ? <img src={thumbnails[project.timestamp]} alt="" className="w-full h-full object-cover" /> : <FolderOpenIcon className="h-4 w-4 text-gray-400 m-2" />}
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-gray-900 dark:text-white">{project.name || 'Untitled Project'}</p>
                                                        <p className="text-xs text-gray-400">#{project.projectNumber || 'N/A'}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-2.5 px-3"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${TYPE_COLOR[project.type]}`}>{getReportTypeName(project.type)}</span></td>
                                            <td className="py-2.5 px-3">{project.status ? <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${STATUS_CONFIG[project.status].className}`}>{STATUS_CONFIG[project.status].label}</span> : <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                                            <td className="py-2.5 px-3 text-xs text-gray-500 dark:text-gray-400">{project.folder || <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                                            <td className="py-2.5 px-3 text-xs text-gray-500 dark:text-gray-400">{new Date(project.timestamp).toLocaleDateString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>

            {/* New Folder Dialog */}
            {newFolderDialogOpen && (
                <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-80 flex flex-col gap-4">
                        <h3 className="text-base font-bold text-gray-900 dark:text-white">New Folder</h3>
                        <div>
                            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-1">Folder Name</label>
                            <input autoFocus type="text" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setNewFolderDialogOpen(false); }} placeholder="e.g. Cenovus" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#007D8C]" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-1">Location (parent folder)</label>
                            <select value={newFolderParent} onChange={e => setNewFolderParent(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#007D8C]">
                                <option value="">Root (top level)</option>
                                {folders.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setNewFolderDialogOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">Cancel</button>
                            <button onClick={handleCreateFolder} className="px-4 py-2 text-sm rounded-lg bg-[#007D8C] text-white hover:bg-[#006b7a] transition-colors font-medium">Create</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Context menu */}
            {contextMenu && (
                <div ref={contextMenuRef} className="fixed z-[200] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-visible w-52" style={{ top: contextMenu.y, left: contextMenu.x }}>
                    <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 truncate">{contextMenu.project.name || 'Untitled'}</p>
                    </div>
                    <CtxBtn icon={<FolderOpenIcon className="h-4 w-4" />} label="Open" onClick={() => { onOpenProject(contextMenu.project); setContextMenu(null); }} />
                    <CtxBtn icon={<DocumentDuplicateIcon className="h-4 w-4" />} label="Duplicate" onClick={() => handleDuplicate(contextMenu.project)} />
                    <CtxBtn icon={<SaveIcon className="h-4 w-4" />} label="Export Project File" onClick={() => handleExportFile(contextMenu.project)} />
                    <CtxBtn icon={<DownloadIcon className="h-4 w-4" />} label="Export as PDF" onClick={() => { setContextMenu(null); onRequestPdfExport(contextMenu.project); }} />
                    <div className="border-t border-gray-100 dark:border-gray-700" />
                    {/* Move to folder submenu */}
                    <div className="relative">
                        <button onClick={() => setContextSubmenu(contextSubmenu === 'folder' ? null : 'folder')} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between">
                            <span className="flex items-center gap-2"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>Move to Folder</span>
                            <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                        </button>
                        {contextSubmenu === 'folder' && (
                            <div className="absolute left-full top-0 ml-1 w-52 max-h-56 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl">
                                {contextMenu.project.folder && <button onClick={() => handleMoveToFolder(contextMenu.project, undefined)} className="w-full text-left px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">Remove from folder</button>}
                                {folders.length === 0 && <p className="px-4 py-2 text-xs text-gray-400 italic">No folders yet.</p>}
                                {folders.map(f => <button key={f} onClick={() => handleMoveToFolder(contextMenu.project, f)} className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between ${contextMenu.project.folder === f ? 'text-[#007D8C] font-medium' : 'text-gray-700 dark:text-gray-200'}`}><span className="truncate">{f}</span>{contextMenu.project.folder === f && <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}</button>)}
                            </div>
                        )}
                    </div>
                    {/* Set status submenu */}
                    <div className="relative">
                        <button onClick={() => setContextSubmenu(contextSubmenu === 'status' ? null : 'status')} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between">
                            <span className="flex items-center gap-2"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>Set Status</span>
                            <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                        </button>
                        {contextSubmenu === 'status' && (
                            <div className="absolute left-full top-0 ml-1 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden">
                                {contextMenu.project.status && <button onClick={() => handleSetStatus(contextMenu.project, undefined)} className="w-full text-left px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">Clear status</button>}
                                {(Object.entries(STATUS_CONFIG) as [ProjectStatus, { label: string; className: string }][]).map(([key, cfg]) => (
                                    <button key={key} onClick={() => handleSetStatus(contextMenu.project, key)} className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700`}>
                                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${cfg.className}`}>{cfg.label}</span>
                                        {contextMenu.project.status === key && <svg className="h-3.5 w-3.5 text-[#007D8C]" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="border-t border-gray-100 dark:border-gray-700" />
                    <CtxBtn icon={<TrashIcon className="h-4 w-4" />} label="Delete permanently" destructive onClick={() => { setConfirmDelete(contextMenu.project); setContextMenu(null); }} />
                </div>
            )}

            {confirmDelete && (
                <ConfirmModal title="Delete project?" message={`"${confirmDelete.name || 'Untitled Project'}" will be permanently deleted and cannot be recovered.`} confirmLabel="Delete" destructive onConfirm={() => handleDeleteProject(confirmDelete)} onCancel={() => setConfirmDelete(null)} />
            )}
        </div>
    );
};

const CtxBtn: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; destructive?: boolean }> = ({ icon, label, onClick, destructive }) => (
    <button onClick={onClick} className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors ${destructive ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
        {icon} {label}
    </button>
);

export default ProjectsView;
