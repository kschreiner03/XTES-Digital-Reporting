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
const SORT_KEY = 'xtec_projects_sort';

type SortField = 'name' | 'projectNumber' | 'date' | 'type' | 'status';
type SortDir = 'asc' | 'desc';

const naturalCompare = (a: string, b: string) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

const STATUS_ORDER: Record<string, number> = { draft: 0, review: 1, final: 2, submitted: 3 };

function sortProjects(list: RecentProject[], field: SortField, dir: SortDir): RecentProject[] {
    return [...list].sort((a, b) => {
        let cmp = 0;
        switch (field) {
            case 'name':          cmp = naturalCompare(a.name || '', b.name || ''); break;
            case 'projectNumber': cmp = naturalCompare(a.projectNumber || '', b.projectNumber || ''); break;
            case 'date':          cmp = a.timestamp - b.timestamp; break;
            case 'type':          cmp = naturalCompare(a.type, b.type); break;
            case 'status':        cmp = (STATUS_ORDER[a.status ?? ''] ?? -1) - (STATUS_ORDER[b.status ?? ''] ?? -1); break;
        }
        return dir === 'asc' ? cmp : -cmp;
    });
}

interface ProjectsViewProps {
    onClose: () => void;
    onOpenProject: (project: RecentProject) => void;
    onRequestPdfExport: (project: RecentProject) => void;
}

interface FolderNode { name: string; path: string; children: FolderNode[]; }

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
        const node: FolderNode = { name: parts[parts.length - 1], path, children: [] };
        nodes[path] = node;
        if (parts.length === 1) roots.push(node);
        else {
            const parent = parts.slice(0, -1).join('/');
            if (nodes[parent]) nodes[parent].children.push(node);
            else roots.push(node);
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
        case 'iogcLeaseAudit': return 'IOGC Lease Audit';
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
    iogcLeaseAudit: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
};

const EXT_MAP: Record<AppType, string> = {
    photoLog: 'plog', dfrStandard: 'dfr', dfrSaskpower: 'spdfr', combinedLog: 'clog', iogcLeaseAudit: 'iogc',
};

// ─── Sidebar folder tree node ─────────────────────────────────────────────────
const SidebarNode: React.FC<{
    node: FolderNode;
    currentPath: string;
    expanded: Set<string>;
    counts: Record<string, number>;
    onNavigate: (path: string) => void;
    onToggle: (path: string) => void;
    depth: number;
}> = ({ node, currentPath, expanded, counts, onNavigate, onToggle, depth }) => {
    const isOpen = expanded.has(node.path);
    const isActive = currentPath === node.path;
    return (
        <div>
            <div className="flex items-center" style={{ paddingLeft: `${depth * 12}px` }}>
                <button onClick={() => onToggle(node.path)} className="p-0.5 w-5 flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                    {node.children.length > 0
                        ? <svg className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                        : <svg className="h-3 w-3 opacity-0" viewBox="0 0 24 24" />}
                </button>
                <button
                    onClick={() => onNavigate(node.path)}
                    className={`flex-1 text-left px-2 py-1 rounded-md text-sm flex items-center justify-between gap-1 min-w-0 transition-colors ${isActive ? 'bg-[#007D8C] text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                >
                    <span className="flex items-center gap-1.5 min-w-0 truncate">
                        <svg className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" fill="currentColor" viewBox="0 0 24 24"><path d="M19.5 21a3 3 0 003-3v-4.5a3 3 0 00-3-3h-15a3 3 0 00-3 3V18a3 3 0 003 3h15zM1.5 10.146V6a3 3 0 013-3h5.379a2.25 2.25 0 011.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 013 3v1.146A4.483 4.483 0 0019.5 9h-15a4.483 4.483 0 00-3 1.146z" /></svg>
                        <span className="truncate">{node.name}</span>
                    </span>
                    {(counts[node.path] ?? 0) > 0 && (
                        <span className={`text-[10px] rounded-full px-1.5 flex-shrink-0 ${isActive ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-300'}`}>{counts[node.path]}</span>
                    )}
                </button>
            </div>
            {isOpen && node.children.map(c => (
                <SidebarNode key={c.path} node={c} currentPath={currentPath} expanded={expanded} counts={counts} onNavigate={onNavigate} onToggle={onToggle} depth={depth + 1} />
            ))}
        </div>
    );
};

// ─── Main component ───────────────────────────────────────────────────────────
const ProjectsView: React.FC<ProjectsViewProps> = ({ onClose, onOpenProject, onRequestPdfExport }) => {
    const [projects, setProjects] = useState<RecentProject[]>([]);
    const [folders, setFolders] = useState<string[]>([]);
    const [thumbnails, setThumbnails] = useState<Record<number, string>>({});

    // Navigation — Windows Explorer style
    const [nav, setNav] = useState<{ history: string[]; idx: number }>({ history: [''], idx: 0 });
    const currentPath = nav.history[nav.idx];
    const canBack = nav.idx > 0;
    const canForward = nav.idx < nav.history.length - 1;

    const navigateTo = (path: string) => {
        setNav(prev => { const h = [...prev.history.slice(0, prev.idx + 1), path]; return { history: h, idx: h.length - 1 }; });
        setSelectedItem(null);
        // Auto-expand ancestors in sidebar
        if (path) {
            const parts = path.split('/');
            const ancestors = parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
            setExpanded(prev => new Set([...prev, ...ancestors]));
        }
    };
    const goBack = () => { setNav(prev => prev.idx > 0 ? { ...prev, idx: prev.idx - 1 } : prev); setSelectedItem(null); };
    const goForward = () => { setNav(prev => prev.idx < prev.history.length - 1 ? { ...prev, idx: prev.idx + 1 } : prev); setSelectedItem(null); };
    const goUp = () => {
        if (!currentPath) return;
        const parent = currentPath.includes('/') ? currentPath.split('/').slice(0, -1).join('/') : '';
        navigateTo(parent);
    };

    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [selectedItem, setSelectedItem] = useState<string | null>(null); // folder path or project timestamp string
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => (localStorage.getItem(VIEW_MODE_KEY) as 'grid' | 'list') || 'grid');
    const [sortField, setSortField] = useState<SortField>(() => {
        try { return (JSON.parse(localStorage.getItem(SORT_KEY) || '{}').field as SortField) || 'date'; } catch { return 'date'; }
    });
    const [sortDir, setSortDir] = useState<SortDir>(() => {
        try { return (JSON.parse(localStorage.getItem(SORT_KEY) || '{}').dir as SortDir) || 'desc'; } catch { return 'desc'; }
    });

    // Context menu — works for both folders and projects
    type CtxTarget = { kind: 'project'; project: RecentProject } | { kind: 'folder'; path: string; name: string };
    const [ctxMenu, setCtxMenu] = useState<{ target: CtxTarget; x: number; y: number } | null>(null);
    const [ctxSubmenu, setCtxSubmenu] = useState<'folder' | 'status' | null>(null);
    const ctxRef = useRef<HTMLDivElement>(null);

    const [confirmDelete, setConfirmDelete] = useState<RecentProject | null>(null);
    const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<string | null>(null);
    const [renamingFolder, setRenamingFolder] = useState<{ path: string; value: string } | null>(null);
    const [newFolderOpen, setNewFolderOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [newFolderParent, setNewFolderParent] = useState('');
    const [exporting, setExporting] = useState<number | null>(null);

    // ── Load data + auto-organize unfiled projects on mount ───────────────────
    useEffect(() => {
        const loaded = getRecentProjects();
        const existingFolders = getFolders();
        setProjects(loaded);
        setFolders(existingFolders);

        loaded.forEach(async p => {
            try {
                const thumb = await retrieveThumbnail(p.timestamp);
                if (thumb) setThumbnails(prev => ({ ...prev, [p.timestamp]: thumb }));
            } catch { /* no thumb */ }
        });

        const unfiled = loaded.filter(p => !p.folder);
        if (unfiled.length === 0) return;

        (async () => {
            const sanitize = (s: string) => s.replace(/[/\\:*?"<>|]/g, '-').replace(/\s{2,}/g, ' ').trim();
            const results = await Promise.all(unfiled.map(async p => {
                if (p.proponent) {
                    return { p, data: { headerData: { proponent: p.proponent, date: p.date || '' } } };
                }
                try { return { p, data: await retrieveProject(p.timestamp) }; }
                catch { return { p, data: null }; }
            }));

            const newFolderSet = new Set<string>(existingFolders);
            const updatedAll = loaded.map(p => ({ ...p }));
            let changed = false;

            for (const { p, data } of results) {
                if (!data) continue;
                const rawDate: string = data.headerData?.date ?? data.date ?? '';
                const ym = rawDate.match(/\b(20\d{2})\b/);
                const year = ym ? ym[1] : String(new Date(p.timestamp).getFullYear());
                const rawProp: string = data.headerData?.proponent ?? data.proponent ?? '';
                const proponent = sanitize(rawProp) || 'Unknown';
                const rawId = p.projectNumber?.trim() || p.name?.trim() || '';
                const projId = sanitize(rawId);
                const lvl2 = `${year}/${proponent}`;
                const lvl3 = projId ? `${lvl2}/${projId}` : '';
                newFolderSet.add(year);
                newFolderSet.add(lvl2);
                if (lvl3) newFolderSet.add(lvl3);
                const idx = updatedAll.findIndex(q => q.timestamp === p.timestamp);
                if (idx !== -1) { updatedAll[idx] = { ...updatedAll[idx], folder: lvl3 || lvl2 }; changed = true; }
            }

            if (!changed) return;
            const newFolders = Array.from(newFolderSet);
            setFolders(newFolders);
            saveFolders(newFolders);
            setProjects(updatedAll);
            saveProjects(updatedAll);

            const years = new Set(results.map(r => {
                const raw: string = r.data?.headerData?.date ?? r.data?.date ?? '';
                const m = raw.match(/\b(20\d{2})\b/);
                return m ? m[1] : String(new Date(r.p.timestamp).getFullYear());
            }));
            setExpanded(prev => new Set([...prev, ...years]));
        })();
    }, []);

    // Close context menu on outside click
    useEffect(() => {
        if (!ctxMenu) return;
        const h = (e: MouseEvent) => {
            if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) { setCtxMenu(null); setCtxSubmenu(null); }
        };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, [ctxMenu]);

    // ── Computed values ───────────────────────────────────────────────────────
    const folderTree = useMemo(() => buildTree(folders), [folders]);

    // Recursive project count per folder (for sidebar badges)
    const folderCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const p of projects) {
            if (!p.folder) continue;
            const parts = p.folder.split('/');
            for (let i = 1; i <= parts.length; i++) {
                const path = parts.slice(0, i).join('/');
                counts[path] = (counts[path] || 0) + 1;
            }
        }
        return counts;
    }, [projects]);

    // Direct child folders of currentPath
    const childFolders = useMemo(() => {
        return folders.filter(f => {
            const parts = f.split('/');
            if (!currentPath) return parts.length === 1;
            return f.startsWith(currentPath + '/') && parts.length === currentPath.split('/').length + 1;
        }).sort(naturalCompare);
    }, [folders, currentPath]);

    // Projects exactly at currentPath (or unfiled at root)
    const projectsAtPath = useMemo(() => {
        const list = projects.filter(p => (p.folder || '') === currentPath);
        return sortProjects(list, sortField, sortDir);
    }, [projects, currentPath, sortField, sortDir]);

    // Global search results
    const searchResults = useMemo(() => {
        if (!searchTerm.trim()) return null;
        const t = searchTerm.toLowerCase();
        return sortProjects(
            projects.filter(p => p.name.toLowerCase().includes(t) || p.projectNumber.toLowerCase().includes(t)),
            sortField, sortDir
        );
    }, [projects, searchTerm, sortField, sortDir]);

    const breadcrumbs = useMemo(() => {
        const crumbs: { label: string; path: string }[] = [{ label: 'Projects', path: '' }];
        if (currentPath) currentPath.split('/').forEach((part, i, arr) =>
            crumbs.push({ label: part, path: arr.slice(0, i + 1).join('/') })
        );
        return crumbs;
    }, [currentPath]);

    // ── Helpers ───────────────────────────────────────────────────────────────
    const updateProjects = (updated: RecentProject[]) => { setProjects(updated); saveProjects(updated); };

    const handleSort = (field: SortField) => {
        const dir: SortDir = sortField === field && sortDir === 'asc' ? 'desc' : 'asc';
        setSortField(field); setSortDir(dir);
        localStorage.setItem(SORT_KEY, JSON.stringify({ field, dir }));
    };

    const setView = (mode: 'grid' | 'list') => { setViewMode(mode); localStorage.setItem(VIEW_MODE_KEY, mode); };

    const handleToggleExpand = (path: string) => setExpanded(prev => {
        const next = new Set(prev); next.has(path) ? next.delete(path) : next.add(path); return next;
    });

    const handleCreateFolder = () => {
        const name = newFolderName.trim();
        if (!name) { setNewFolderOpen(false); return; }
        const path = newFolderParent ? `${newFolderParent}/${name}` : name;
        if (folders.includes(path)) { toast('A folder with that name already exists.', 'error'); return; }
        const updated = [...folders, path];
        setFolders(updated); saveFolders(updated);
        setNewFolderOpen(false); setNewFolderName(''); setNewFolderParent('');
        navigateTo(path);
    };

    const handleDeleteFolder = (path: string) => {
        const toRemove = folders.filter(f => f === path || f.startsWith(path + '/'));
        updateProjects(projects.map(p => toRemove.includes(p.folder || '') ? { ...p, folder: undefined } : p));
        const remaining = folders.filter(f => !toRemove.includes(f));
        setFolders(remaining); saveFolders(remaining);
        if (currentPath && toRemove.includes(currentPath)) navigateTo('');
        setConfirmDeleteFolder(null);
    };

    const handleRenameFolder = () => {
        if (!renamingFolder) return;
        const newName = renamingFolder.value.trim();
        if (!newName) { setRenamingFolder(null); return; }
        const oldPath = renamingFolder.path;
        const parentPath = oldPath.includes('/') ? oldPath.split('/').slice(0, -1).join('/') : '';
        const newPath = parentPath ? `${parentPath}/${newName}` : newName;
        if (newPath === oldPath) { setRenamingFolder(null); return; }
        if (folders.includes(newPath)) { toast('A folder with that name already exists.', 'error'); return; }

        // Update all folder paths that start with oldPath
        const updatedFolders = folders.map(f => {
            if (f === oldPath) return newPath;
            if (f.startsWith(oldPath + '/')) return newPath + f.slice(oldPath.length);
            return f;
        });
        // Update all projects whose folder starts with oldPath
        const updatedProjects = projects.map(p => {
            if (!p.folder) return p;
            if (p.folder === oldPath) return { ...p, folder: newPath };
            if (p.folder.startsWith(oldPath + '/')) return { ...p, folder: newPath + p.folder.slice(oldPath.length) };
            return p;
        });
        setFolders(updatedFolders); saveFolders(updatedFolders);
        updateProjects(updatedProjects);
        // Update navigation history if current path was inside renamed folder
        setNav(prev => ({
            history: prev.history.map(h => {
                if (h === oldPath) return newPath;
                if (h.startsWith(oldPath + '/')) return newPath + h.slice(oldPath.length);
                return h;
            }),
            idx: prev.idx,
        }));
        setRenamingFolder(null);
    };

    const handleDeleteProject = async (project: RecentProject) => {
        setConfirmDelete(null);
        updateProjects(projects.filter(p => p.timestamp !== project.timestamp));
        try {
            const data = await retrieveProject(project.timestamp);
            if (data?.photosData) for (const ph of data.photosData) if (ph.imageId) await deleteImage(ph.imageId);
        } catch { /* ignore */ }
        try { await deleteProject(project.timestamp); } catch { /* ignore */ }
        try { await deleteThumbnail(project.timestamp); } catch { /* ignore */ }
    };

    const handleMoveToFolder = (project: RecentProject, folder: string | undefined) => {
        updateProjects(projects.map(p => p.timestamp === project.timestamp ? { ...p, folder } : p));
        setCtxMenu(null); setCtxSubmenu(null);
    };

    const handleSetStatus = (project: RecentProject, status: ProjectStatus | undefined) => {
        updateProjects(projects.map(p => p.timestamp === project.timestamp ? { ...p, status } : p));
        setCtxMenu(null); setCtxSubmenu(null);
    };

    const handleDuplicate = async (project: RecentProject) => {
        setCtxMenu(null);
        try {
            const data = await retrieveProject(project.timestamp);
            if (!data) { toast('Could not duplicate — project data not found.', 'error'); return; }
            const newTs = Date.now();
            await storeProject(newTs, data);
            const thumb = thumbnails[project.timestamp];
            if (thumb) { await storeThumbnail(newTs, thumb); setThumbnails(prev => ({ ...prev, [newTs]: thumb })); }
            const dup: RecentProject = { ...project, name: `${project.name || 'Copy'} (Copy)`, timestamp: newTs, status: 'draft' };
            updateProjects([dup, ...projects]);
            toast('Project duplicated.', 'success');
        } catch { toast('Failed to duplicate project.', 'error'); }
    };

    const handleExportFile = async (project: RecentProject) => {
        setCtxMenu(null);
        setExporting(project.timestamp);
        try {
            const data = await retrieveProject(project.timestamp);
            if (!data) { toast('Could not export — project data not found.', 'error'); return; }
            const photosForExport = data.photosData ? data.photosData.map(({ imageId, ...rest }: any) => rest) : data.photosData;
            const json = JSON.stringify({ ...data, photosData: photosForExport });
            const ext = EXT_MAP[project.type] || 'json';
            const filename = `${project.projectNumber || project.name || 'project'}.${ext}`.replace(/\s+/g, '_');
            // @ts-ignore
            if (window.electronAPI?.saveProject) { // @ts-ignore
                await window.electronAPI.saveProject(json, filename);
            } else {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
                a.download = filename; a.click();
            }
            toast('Project exported.', 'success');
        } catch { toast('Failed to export project.', 'error'); }
        finally { setExporting(null); }
    };

    const openCtxMenu = (e: React.MouseEvent, target: CtxTarget) => {
        e.preventDefault(); e.stopPropagation();
        setCtxMenu({ target, x: Math.min(e.clientX, window.innerWidth - 230), y: Math.min(e.clientY, window.innerHeight - 320) });
        setCtxSubmenu(null);
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <svg className="h-3 w-3 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" /></svg>;
        return sortDir === 'asc'
            ? <svg className="h-3 w-3 text-[#007D8C]" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
            : <svg className="h-3 w-3 text-[#007D8C]" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>;
    };

    const folderName = (path: string) => path.split('/').pop() || path;
    const totalItems = childFolders.length + projectsAtPath.length;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-gray-50 dark:bg-[#111] xtec-modal-enter" onClick={() => setSelectedItem(null)}>

            {/* ── Header ── */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-[#007D8C]/20 bg-white dark:bg-[#1a1a1a] flex-shrink-0">
                {/* Back / Up */}
                <button onClick={goBack} disabled={!canBack} title="Back" className="p-1.5 rounded-lg text-gray-400 hover:text-[#007D8C] hover:bg-[#007D8C]/10 disabled:opacity-25 transition-colors">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
                </button>
                <button onClick={goUp} disabled={!currentPath} title="Up one level" className="p-1.5 rounded-lg text-gray-400 hover:text-[#007D8C] hover:bg-[#007D8C]/10 disabled:opacity-25 transition-colors">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" /></svg>
                </button>

                {/* Breadcrumb */}
                <div className="flex items-center gap-1 text-sm min-w-0 flex-1">
                    {searchTerm.trim() ? (
                        <span className="text-gray-400 italic text-sm">Search results for "{searchTerm}"</span>
                    ) : breadcrumbs.map((crumb, i) => (
                        <React.Fragment key={crumb.path}>
                            {i > 0 && <span className="text-gray-300 dark:text-gray-600 select-none">/</span>}
                            <button
                                onClick={e => { e.stopPropagation(); navigateTo(crumb.path); }}
                                className={`px-1 py-0.5 rounded transition-colors truncate max-w-[200px] ${i === breadcrumbs.length - 1 ? 'font-semibold text-gray-800 dark:text-white cursor-default' : 'text-[#007D8C] hover:bg-[#007D8C]/10'}`}
                            >{crumb.label}</button>
                        </React.Fragment>
                    ))}
                </div>

                {/* Search */}
                <div className="relative flex-shrink-0">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    <input
                        type="search" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Search projects…" onClick={e => e.stopPropagation()}
                        className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-[#3d3d3d] bg-gray-50 dark:bg-[#1e1e1e] text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-[#007D8C]/50 focus:ring-2 focus:ring-[#007D8C]/20 w-44"
                    />
                </div>

                {/* Sort */}
                <select
                    value={`${sortField}:${sortDir}`}
                    onClick={e => e.stopPropagation()}
                    onChange={e => {
                        const [f, d] = e.target.value.split(':') as [SortField, SortDir];
                        setSortField(f); setSortDir(d);
                        localStorage.setItem(SORT_KEY, JSON.stringify({ field: f, dir: d }));
                    }}
                    className="text-xs rounded-lg border border-gray-200 dark:border-[#3d3d3d] bg-gray-50 dark:bg-[#1e1e1e] text-gray-600 dark:text-gray-300 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#007D8C]/20 flex-shrink-0"
                >
                    <option value="date:desc">Newest first</option>
                    <option value="date:asc">Oldest first</option>
                    <option value="projectNumber:asc">Project # ↑</option>
                    <option value="projectNumber:desc">Project # ↓</option>
                    <option value="name:asc">Name A→Z</option>
                    <option value="name:desc">Name Z→A</option>
                    <option value="type:asc">Type</option>
                    <option value="status:asc">Status</option>
                </select>

                {/* View toggle */}
                <div className="flex items-center bg-gray-100 dark:bg-[#2a2a2a] rounded-lg p-0.5 flex-shrink-0">
                    <button onClick={e => { e.stopPropagation(); setView('grid'); }} title="Grid" className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white dark:bg-[#3a3a3a] text-[#007D8C] shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25A2.25 2.25 0 0113.5 8.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>
                    </button>
                    <button onClick={e => { e.stopPropagation(); setView('list'); }} title="List" className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-[#3a3a3a] text-[#007D8C] shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                    </button>
                </div>

                <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#2a2a2a] transition-colors flex-shrink-0">
                    <CloseIcon className="h-5 w-5" />
                </button>
            </div>

            {/* ── Body ── */}
            <div className="flex flex-1 min-h-0">
                {/* Sidebar */}
                <div className="w-52 flex-shrink-0 border-r border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#1a1a1a] flex flex-col">
                    <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
                        <button
                            onClick={() => navigateTo('')}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2.5 transition-colors ${currentPath === '' && !searchTerm ? 'bg-[#007D8C]/10 text-[#007D8C] dark:text-[#00afc4]' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#2a2a2a] hover:text-gray-900 dark:hover:text-white'}`}
                        >
                            <FolderOpenIcon className="h-4 w-4 flex-shrink-0" />
                            <span>All Projects</span>
                            <span className="ml-auto text-[10px] bg-gray-100 dark:bg-[#2a2a2a] text-gray-500 dark:text-gray-400 rounded-full px-1.5 py-0.5">{projects.length}</span>
                        </button>

                        {folderTree.length > 0 && (
                            <>
                                <p className="px-3 pt-3 pb-1 text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600">Folders</p>
                                {folderTree.map(node => (
                                    <SidebarNode key={node.path} node={node} currentPath={currentPath} expanded={expanded} counts={folderCounts} onNavigate={navigateTo} onToggle={handleToggleExpand} depth={0} />
                                ))}
                            </>
                        )}
                    </nav>
                    <div className="p-3 border-t border-gray-100 dark:border-[#2a2a2a]">
                        <button
                            onClick={e => { e.stopPropagation(); setNewFolderName(''); setNewFolderParent(currentPath); setNewFolderOpen(true); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#007D8C] hover:bg-[#007D8C]/10 rounded-lg transition-colors font-medium"
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                            New Folder
                        </button>
                    </div>
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0 overflow-y-auto p-5">
                    {searchTerm.trim() ? (
                        searchResults && searchResults.length === 0 ? (
                            <EmptyState label="No matching projects" sub="Try a different search term." />
                        ) : viewMode === 'grid' ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                                {searchResults?.map(p => <ProjectCard key={p.timestamp} project={p} thumb={thumbnails[p.timestamp]} exporting={exporting} selected={selectedItem === String(p.timestamp)} onClick={e => { e.stopPropagation(); setSelectedItem(String(p.timestamp)); }} onDoubleClick={() => onOpenProject(p)} onCtxMenu={e => openCtxMenu(e, { kind: 'project', project: p })} />)}
                            </div>
                        ) : (
                            <DetailsList folders={[]} projects={searchResults || []} thumbnails={thumbnails} exporting={exporting} selectedItem={selectedItem} sortField={sortField} SortIcon={SortIcon} onSort={handleSort} onFolderClick={() => {}} onFolderDblClick={() => {}} onProjectClick={(p, e) => { e.stopPropagation(); setSelectedItem(String(p.timestamp)); }} onProjectDblClick={p => onOpenProject(p)} onFolderCtx={() => {}} onProjectCtx={(p, e) => openCtxMenu(e, { kind: 'project', project: p })} folderName={folderName} />
                        )
                    ) : childFolders.length === 0 && projectsAtPath.length === 0 ? (
                        <EmptyState label="This folder is empty" sub="Projects are organized here automatically." />
                    ) : viewMode === 'grid' ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                            {childFolders.map(path => (
                                <div
                                    key={path}
                                    onClick={e => { e.stopPropagation(); setSelectedItem(path); }}
                                    onDoubleClick={() => navigateTo(path)}
                                    onContextMenu={e => openCtxMenu(e, { kind: 'folder', path, name: folderName(path) })}
                                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl border cursor-pointer transition-all select-none ${selectedItem === path ? 'bg-[#007D8C]/10 border-[#007D8C]/40 dark:bg-[#007D8C]/20 dark:border-[#007D8C]/40' : 'bg-white dark:bg-[#1e1e1e] border-gray-100 dark:border-[#2a2a2a] hover:border-[#007D8C]/30 hover:bg-teal-50/50 dark:hover:bg-[#073d44]/30 shadow-sm hover:shadow-md'}`}
                                >
                                    <svg className="h-12 w-12 text-amber-400" fill="currentColor" viewBox="0 0 24 24"><path d="M19.5 21a3 3 0 003-3v-4.5a3 3 0 00-3-3h-15a3 3 0 00-3 3V18a3 3 0 003 3h15zM1.5 10.146V6a3 3 0 013-3h5.379a2.25 2.25 0 011.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 013 3v1.146A4.483 4.483 0 0019.5 9h-15a4.483 4.483 0 00-3 1.146z" /></svg>
                                    <p className="text-xs font-semibold text-gray-800 dark:text-white text-center truncate w-full">{folderName(path)}</p>
                                    <p className="text-[10px] text-gray-400 dark:text-gray-500">{folderCounts[path] ?? 0} item{(folderCounts[path] ?? 0) !== 1 ? 's' : ''}</p>
                                </div>
                            ))}
                            {projectsAtPath.map(p => (
                                <ProjectCard key={p.timestamp} project={p} thumb={thumbnails[p.timestamp]} exporting={exporting} selected={selectedItem === String(p.timestamp)} onClick={e => { e.stopPropagation(); setSelectedItem(String(p.timestamp)); }} onDoubleClick={() => onOpenProject(p)} onCtxMenu={e => openCtxMenu(e, { kind: 'project', project: p })} />
                            ))}
                        </div>
                    ) : (
                        <DetailsList
                            folders={childFolders} projects={projectsAtPath} thumbnails={thumbnails} exporting={exporting}
                            selectedItem={selectedItem} sortField={sortField} SortIcon={SortIcon} onSort={handleSort}
                            onFolderClick={(path, e) => { e.stopPropagation(); setSelectedItem(path); }}
                            onFolderDblClick={path => navigateTo(path)}
                            onProjectClick={(p, e) => { e.stopPropagation(); setSelectedItem(String(p.timestamp)); }}
                            onProjectDblClick={p => onOpenProject(p)}
                            onFolderCtx={(path, e) => openCtxMenu(e, { kind: 'folder', path, name: folderName(path) })}
                            onProjectCtx={(p, e) => openCtxMenu(e, { kind: 'project', project: p })}
                            folderName={folderName}
                        />
                    )}
                </div>
            </div>

            {/* ── Status bar ── */}
            <div className="px-5 py-1.5 border-t border-gray-100 dark:border-[#2a2a2a] bg-white dark:bg-[#1a1a1a] flex-shrink-0 flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
                {searchTerm.trim()
                    ? <span>{searchResults?.length ?? 0} result{(searchResults?.length ?? 0) !== 1 ? 's' : ''}</span>
                    : <span>{totalItems} item{totalItems !== 1 ? 's' : ''}{childFolders.length > 0 && projectsAtPath.length > 0 ? ` — ${childFolders.length} folder${childFolders.length !== 1 ? 's' : ''}, ${projectsAtPath.length} report${projectsAtPath.length !== 1 ? 's' : ''}` : ''}</span>
                }
                {selectedItem && <span className="text-[#007D8C]">· 1 selected</span>}
            </div>

            {/* ── New Folder dialog ── */}
            {newFolderOpen && (
                <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center" onClick={() => setNewFolderOpen(false)}>
                    <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl border border-gray-100 dark:border-[#3d3d3d] p-6 w-80 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
                        <h3 className="text-base font-bold text-gray-900 dark:text-white">New Folder</h3>
                        <div>
                            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-1.5">Name</label>
                            <input autoFocus type="text" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setNewFolderOpen(false); }} placeholder="e.g. Cenovus" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-[#3d3d3d] bg-gray-50 dark:bg-[#111] text-gray-900 dark:text-white text-sm focus:outline-none focus:border-[#007D8C]/50 focus:ring-2 focus:ring-[#007D8C]/20" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-1.5">Location</label>
                            <select value={newFolderParent} onChange={e => setNewFolderParent(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-[#3d3d3d] bg-gray-50 dark:bg-[#111] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#007D8C]/20">
                                <option value="">Root</option>
                                {folders.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                        </div>
                        <div className="flex gap-2 justify-end pt-1">
                            <button onClick={() => setNewFolderOpen(false)} className="px-4 py-2 text-sm rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#2a2a2a] transition-colors">Cancel</button>
                            <button onClick={handleCreateFolder} className="px-4 py-2 text-sm rounded-lg bg-[#007D8C] text-white hover:bg-[#006b7a] transition-colors font-semibold">Create</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Context menu ── */}
            {ctxMenu && (
                <div ref={ctxRef} className="fixed z-[200] bg-white dark:bg-[#1e1e1e] border border-gray-100 dark:border-[#3d3d3d] rounded-2xl shadow-2xl overflow-visible w-52 py-1.5" style={{ top: ctxMenu.y, left: ctxMenu.x }} onClick={e => e.stopPropagation()}>
                    <div className="px-4 py-2 border-b border-gray-100 dark:border-[#2a2a2a] mb-1">
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 truncate">
                            {ctxMenu.target.kind === 'folder' ? `📁 ${ctxMenu.target.name}` : (ctxMenu.target.project.name || 'Untitled')}
                        </p>
                    </div>

                    {ctxMenu.target.kind === 'folder' ? (
                        // Folder context menu
                        <>
                            <CtxBtn icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>} label="Open" onClick={() => { navigateTo(ctxMenu.target.kind === 'folder' ? ctxMenu.target.path : ''); setCtxMenu(null); }} />
                            <CtxBtn icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>} label="New Subfolder" onClick={() => { const t = ctxMenu.target; if (t.kind === 'folder') { setNewFolderParent(t.path); } setNewFolderName(''); setNewFolderOpen(true); setCtxMenu(null); }} />
                            <CtxBtn icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" /></svg>} label="Rename" onClick={() => { const t = ctxMenu.target; if (t.kind === 'folder') setRenamingFolder({ path: t.path, value: t.name }); setCtxMenu(null); }} />
                            <div className="border-t border-gray-100 dark:border-gray-700" />
                            <CtxBtn icon={<TrashIcon className="h-4 w-4" />} label="Delete" destructive onClick={() => { const t = ctxMenu.target; if (t.kind === 'folder') setConfirmDeleteFolder(t.path); setCtxMenu(null); }} />
                        </>
                    ) : (
                        // Project context menu
                        <>
                            <CtxBtn icon={<FolderOpenIcon className="h-4 w-4" />} label="Open" onClick={() => { if (ctxMenu.target.kind === 'project') onOpenProject(ctxMenu.target.project); setCtxMenu(null); }} />
                            <CtxBtn icon={<DocumentDuplicateIcon className="h-4 w-4" />} label="Duplicate" onClick={() => { if (ctxMenu.target.kind === 'project') handleDuplicate(ctxMenu.target.project); }} />
                            <CtxBtn icon={<SaveIcon className="h-4 w-4" />} label="Export Project File" onClick={() => { if (ctxMenu.target.kind === 'project') handleExportFile(ctxMenu.target.project); }} />
                            <CtxBtn icon={<DownloadIcon className="h-4 w-4" />} label="Export as PDF" onClick={() => { if (ctxMenu.target.kind === 'project') { onRequestPdfExport(ctxMenu.target.project); setCtxMenu(null); } }} />
                            <div className="border-t border-gray-100 dark:border-gray-700" />
                            {/* Move to folder */}
                            <div className="relative">
                                <button onClick={() => setCtxSubmenu(ctxSubmenu === 'folder' ? null : 'folder')} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between">
                                    <span className="flex items-center gap-2"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>Move to Folder</span>
                                    <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                                </button>
                                {ctxSubmenu === 'folder' && ctxMenu.target.kind === 'project' && (
                                    <div className="absolute left-full top-0 ml-1 w-52 max-h-56 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl">
                                        {ctxMenu.target.project.folder && <button onClick={() => handleMoveToFolder(ctxMenu.target.kind === 'project' ? ctxMenu.target.project : ctxMenu.target as any, undefined)} className="w-full text-left px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">Remove from folder</button>}
                                        {folders.map(f => <button key={f} onClick={() => ctxMenu.target.kind === 'project' && handleMoveToFolder(ctxMenu.target.project, f)} className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between ${ctxMenu.target.kind === 'project' && ctxMenu.target.project.folder === f ? 'text-[#007D8C] font-medium' : 'text-gray-700 dark:text-gray-200'}`}><span className="truncate">{f}</span>{ctxMenu.target.kind === 'project' && ctxMenu.target.project.folder === f && <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}</button>)}
                                    </div>
                                )}
                            </div>
                            {/* Set status */}
                            <div className="relative">
                                <button onClick={() => setCtxSubmenu(ctxSubmenu === 'status' ? null : 'status')} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between">
                                    <span className="flex items-center gap-2"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>Set Status</span>
                                    <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                                </button>
                                {ctxSubmenu === 'status' && ctxMenu.target.kind === 'project' && (
                                    <div className="absolute left-full top-0 ml-1 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden">
                                        {ctxMenu.target.project.status && <button onClick={() => ctxMenu.target.kind === 'project' && handleSetStatus(ctxMenu.target.project, undefined)} className="w-full text-left px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">Clear status</button>}
                                        {(Object.entries(STATUS_CONFIG) as [ProjectStatus, { label: string; className: string }][]).map(([key, cfg]) => (
                                            <button key={key} onClick={() => ctxMenu.target.kind === 'project' && handleSetStatus(ctxMenu.target.project, key)} className="w-full text-left px-4 py-2 text-sm flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700">
                                                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${cfg.className}`}>{cfg.label}</span>
                                                {ctxMenu.target.kind === 'project' && ctxMenu.target.project.status === key && <svg className="h-3.5 w-3.5 text-[#007D8C]" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="border-t border-gray-100 dark:border-gray-700" />
                            <CtxBtn icon={<TrashIcon className="h-4 w-4" />} label="Delete permanently" destructive onClick={() => { if (ctxMenu.target.kind === 'project') setConfirmDelete(ctxMenu.target.project); setCtxMenu(null); }} />
                        </>
                    )}
                </div>
            )}

            {renamingFolder && (
                <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center" onClick={() => setRenamingFolder(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-80 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
                        <h3 className="text-base font-bold text-gray-900 dark:text-white">Rename Folder</h3>
                        <input
                            autoFocus
                            type="text"
                            value={renamingFolder.value}
                            onChange={e => setRenamingFolder(prev => prev ? { ...prev, value: e.target.value } : null)}
                            onKeyDown={e => { if (e.key === 'Enter') handleRenameFolder(); if (e.key === 'Escape') setRenamingFolder(null); }}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#007D8C]"
                        />
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setRenamingFolder(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">Cancel</button>
                            <button onClick={handleRenameFolder} className="px-4 py-2 text-sm rounded-lg bg-[#007D8C] text-white hover:bg-[#006b7a] transition-colors font-medium">Rename</button>
                        </div>
                    </div>
                </div>
            )}

            {confirmDeleteFolder && (
                <ConfirmModal title="Delete folder?" message={`"${folderName(confirmDeleteFolder)}" and all its sub-folders will be deleted. Projects inside will be unfiled.`} confirmLabel="Delete" destructive onConfirm={() => handleDeleteFolder(confirmDeleteFolder)} onCancel={() => setConfirmDeleteFolder(null)} />
            )}
            {confirmDelete && (
                <ConfirmModal title="Delete project?" message={`"${confirmDelete.name || 'Untitled'}" will be permanently deleted and cannot be recovered.`} confirmLabel="Delete" destructive onConfirm={() => handleDeleteProject(confirmDelete)} onCancel={() => setConfirmDelete(null)} />
            )}
        </div>
    );
};

// ─── Project card (grid view) ─────────────────────────────────────────────────
const ProjectCard: React.FC<{
    project: RecentProject; thumb?: string; exporting: number | null; selected: boolean;
    onClick: (e: React.MouseEvent) => void; onDoubleClick: () => void; onCtxMenu: (e: React.MouseEvent) => void;
}> = ({ project, thumb, exporting, selected, onClick, onDoubleClick, onCtxMenu }) => (
    <div
        onClick={onClick} onDoubleClick={onDoubleClick} onContextMenu={onCtxMenu}
        className={`group relative rounded-2xl border overflow-hidden cursor-pointer transition-all select-none flex flex-col shadow-sm ${selected ? 'bg-[#007D8C]/10 border-[#007D8C]/50 shadow-md dark:bg-[#073d44]/60 dark:border-[#007D8C]/40' : 'bg-white dark:bg-[#1e1e1e] border-gray-100 dark:border-[#2a2a2a] hover:shadow-md hover:border-[#007D8C]/30 dark:hover:border-[#007D8C]/30'}`}
    >
        <div className="h-28 bg-teal-50 dark:bg-[#073d44]/40 flex items-center justify-center overflow-hidden relative flex-shrink-0">
            {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : <FolderOpenIcon className="h-8 w-8 text-[#007D8C]/30" />}
            {exporting === project.timestamp && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><span className="text-white text-xs font-medium">Exporting…</span></div>}
            {project.status && <span className={`absolute top-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md ${STATUS_CONFIG[project.status].className}`}>{STATUS_CONFIG[project.status].label}</span>}
        </div>
        <div className="p-3 flex flex-col flex-1">
            <p className="text-xs font-semibold text-gray-800 dark:text-white truncate">{project.name || 'Untitled'}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">#{project.projectNumber || 'N/A'}</p>
            <div className="mt-2 flex items-center justify-between">
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${TYPE_COLOR[project.type]}`}>{getReportTypeName(project.type)}</span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500">{new Date(project.timestamp).toLocaleDateString()}</span>
            </div>
        </div>
    </div>
);

// ─── Details list (list view) ─────────────────────────────────────────────────
const DetailsList: React.FC<{
    folders: string[]; projects: RecentProject[]; thumbnails: Record<number, string>;
    exporting: number | null; selectedItem: string | null;
    sortField: SortField; SortIcon: React.FC<{ field: SortField }>; onSort: (f: SortField) => void;
    onFolderClick: (path: string, e: React.MouseEvent) => void;
    onFolderDblClick: (path: string) => void;
    onProjectClick: (p: RecentProject, e: React.MouseEvent) => void;
    onProjectDblClick: (p: RecentProject) => void;
    onFolderCtx: (path: string, e: React.MouseEvent) => void;
    onProjectCtx: (p: RecentProject, e: React.MouseEvent) => void;
    folderName: (path: string) => string;
}> = ({ folders, projects, thumbnails, exporting, selectedItem, sortField, SortIcon, onSort, onFolderClick, onFolderDblClick, onProjectClick, onProjectDblClick, onFolderCtx, onProjectCtx, folderName }) => (
    <table className="w-full text-sm">
        <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
                {([['name', 'Name'], ['projectNumber', 'Project #'], ['type', 'Type'], ['status', 'Status']] as [SortField, string][]).map(([f, label]) => (
                    <th key={f} onClick={() => onSort(f)} className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-[#007D8C] select-none">
                        <span className="flex items-center gap-1">{label}<SortIcon field={f} /></span>
                    </th>
                ))}
                <th onClick={() => onSort('date')} className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-[#007D8C] select-none">
                    <span className="flex items-center gap-1">Date<SortIcon field="date" /></span>
                </th>
            </tr>
        </thead>
        <tbody>
            {folders.map(path => (
                <tr key={path} onClick={e => onFolderClick(path, e)} onDoubleClick={() => onFolderDblClick(path)} onContextMenu={e => onFolderCtx(path, e)}
                    className={`border-b border-gray-50 dark:border-[#2a2a2a] cursor-pointer transition-colors select-none ${selectedItem === path ? 'bg-[#007D8C]/10 dark:bg-[#073d44]/40' : 'hover:bg-[#007D8C]/5 dark:hover:bg-[#007D8C]/5'}`}>
                    <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                            <svg className="h-5 w-5 text-amber-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M19.5 21a3 3 0 003-3v-4.5a3 3 0 00-3-3h-15a3 3 0 00-3 3V18a3 3 0 003 3h15zM1.5 10.146V6a3 3 0 013-3h5.379a2.25 2.25 0 011.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 013 3v1.146A4.483 4.483 0 0019.5 9h-15a4.483 4.483 0 00-3 1.146z" /></svg>
                            <span className="font-semibold text-gray-800 dark:text-white">{folderName(path)}</span>
                        </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-400 dark:text-gray-600">—</td>
                    <td className="py-3 px-4"><span className="text-[10px] text-gray-400 dark:text-gray-500">Folder</span></td>
                    <td className="py-3 px-4 text-xs text-gray-400 dark:text-gray-600">—</td>
                    <td className="py-3 px-4 text-xs text-gray-400 dark:text-gray-600">—</td>
                </tr>
            ))}
            {projects.map(p => (
                <tr key={p.timestamp} onClick={e => onProjectClick(p, e)} onDoubleClick={() => onProjectDblClick(p)} onContextMenu={e => onProjectCtx(p, e)}
                    className={`border-b border-gray-50 dark:border-[#2a2a2a] cursor-pointer transition-colors select-none ${selectedItem === String(p.timestamp) ? 'bg-[#007D8C]/10 dark:bg-[#073d44]/40' : 'hover:bg-[#007D8C]/5 dark:hover:bg-[#007D8C]/5'}`}>
                    <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg overflow-hidden bg-teal-50 dark:bg-[#073d44]/40 flex-shrink-0 flex items-center justify-center">
                                {thumbnails[p.timestamp] ? <img src={thumbnails[p.timestamp]} alt="" className="w-full h-full object-cover" /> : <FolderOpenIcon className="h-4 w-4 text-[#007D8C]/40" />}
                            </div>
                            <div>
                                <p className="font-semibold text-gray-800 dark:text-white text-sm">{p.name || 'Untitled'}</p>
                                {exporting === p.timestamp && <span className="text-[10px] text-gray-400 italic">Exporting…</span>}
                            </div>
                        </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-500 dark:text-gray-400 font-mono">{p.projectNumber || '—'}</td>
                    <td className="py-3 px-4"><span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${TYPE_COLOR[p.type]}`}>{getReportTypeName(p.type)}</span></td>
                    <td className="py-3 px-4">{p.status ? <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${STATUS_CONFIG[p.status].className}`}>{STATUS_CONFIG[p.status].label}</span> : <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                    <td className="py-3 px-4 text-xs text-gray-500 dark:text-gray-400">{new Date(p.timestamp).toLocaleDateString()}</td>
                </tr>
            ))}
        </tbody>
    </table>
);

const EmptyState: React.FC<{ label: string; sub: string }> = ({ label, sub }) => (
    <div className="flex flex-col items-center justify-center h-full text-center py-20">
        <div className="w-16 h-16 rounded-2xl bg-teal-50 dark:bg-[#073d44]/40 flex items-center justify-center mb-4">
            <FolderOpenIcon className="h-8 w-8 text-[#007D8C]/40" />
        </div>
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400">{label}</h3>
        <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">{sub}</p>
    </div>
);

const CtxBtn: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; destructive?: boolean }> = ({ icon, label, onClick, destructive }) => (
    <button onClick={onClick} className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2.5 transition-colors rounded-md mx-1 w-[calc(100%-8px)] ${destructive ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20' : 'text-gray-700 dark:text-gray-200 hover:bg-[#007D8C]/10 dark:hover:bg-[#007D8C]/10 hover:text-[#007D8C] dark:hover:text-[#00afc4]'}`}>
        {icon}{label}
    </button>
);

export default ProjectsView;
