import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { storeProject, storeThumbnail } from './db';
import type { RecentProject } from './LandingPage';
import type { AppType } from '../App';
import { generateProjectThumbnail } from './thumbnailUtils';

interface Props {
    zipData: ArrayBuffer;
    onClose: () => void;
    onImportProject: (project: RecentProject) => void;
}

const RECENT_PROJECTS_KEY = 'xtec_recent_projects';

const EXT_TO_TYPE: Record<string, AppType> = {
    plog: 'photoLog',
    dfr: 'dfrStandard',
    spdfr: 'dfrSaskpower',
    clog: 'combinedLog',
    iogc: 'iogcLeaseAudit',
};

const safeSet = (key: string, value: string) => {
    try { localStorage.setItem(key, value); } catch {}
};

const OpenPackageModal: React.FC<Props> = ({ zipData, onClose, onImportProject }) => {
    const [status, setStatus] = useState<'extracting' | 'done' | 'error'>('extracting');
    const [message, setMessage] = useState('Extracting package...');

    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            try {
                const zip = await JSZip.loadAsync(zipData);

                // Read manifest
                const manifestFile = zip.file('manifest.json');
                if (!manifestFile) throw new Error('Invalid package: manifest.json not found.');
                const manifest = JSON.parse(await manifestFile.async('string'));
                const { projectType, projectName } = manifest as {
                    projectType: string;
                    projectName: string;
                };

                const appType = EXT_TO_TYPE[projectType];
                if (!appType) throw new Error(`Unknown project type: ${projectType}`);

                // Read project data
                const projectFile = zip.file('project.json');
                if (!projectFile) throw new Error('Invalid package: project.json not found.');
                const projectData = JSON.parse(await projectFile.async('string'));

                // Build assetPath → base64 data URI map from assets/ folder
                const assetMap = new Map<string, string>();
                const assetsFolder = zip.folder('assets');
                if (assetsFolder) {
                    const assetFiles: Promise<void>[] = [];
                    assetsFolder.forEach((relativePath, file) => {
                        if (file.dir) return;
                        assetFiles.push(
                            file.async('base64').then(b64 => {
                                const ext = relativePath.split('.').pop()?.toLowerCase() ?? 'jpeg';
                                const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
                                assetMap.set(`assets/${relativePath}`, `data:${mime};base64,${b64}`);
                            })
                        );
                    });
                    await Promise.all(assetFiles);
                }

                // Replace assetPath → imageUrl throughout project data
                const restoreImageUrls = (obj: any) => {
                    if (!obj || typeof obj !== 'object') return;
                    if (Array.isArray(obj)) {
                        obj.forEach(restoreImageUrls);
                    } else {
                        if (typeof obj.assetPath === 'string' && assetMap.has(obj.assetPath)) {
                            obj.imageUrl = assetMap.get(obj.assetPath)!;
                            delete obj.assetPath;
                        }
                        Object.values(obj).forEach(restoreImageUrls);
                    }
                };
                restoreImageUrls(projectData);

                if (cancelled) return;

                const timestamp = Date.now();

                // Store project data in IndexedDB
                await storeProject(timestamp, projectData);

                // Generate and store thumbnail
                try {
                    const firstPhoto = (projectData.photosData ?? projectData.photos ?? []).find(
                        (p: any) => p.imageUrl && !p.isMap
                    );
                    const thumbnail = await generateProjectThumbnail({
                        type: appType,
                        projectName,
                        firstPhotoUrl: firstPhoto?.imageUrl ?? null,
                    });
                    await storeThumbnail(timestamp, thumbnail);
                } catch {}

                // Extract header fields for recent project metadata
                const header = projectData.headerData ?? projectData.header ?? {};
                const projectNumber = header.projectNumber ?? header.jobNumber ?? '';
                const proponent = header.clientName ?? header.proponent ?? '';
                const date = header.reportDate ?? header.date ?? '';

                const recentProject: RecentProject = {
                    type: appType,
                    name: projectName,
                    projectNumber,
                    timestamp,
                    proponent: proponent || undefined,
                    date: date || undefined,
                };

                // Add to localStorage recent projects list
                try {
                    const existing = JSON.parse(localStorage.getItem(RECENT_PROJECTS_KEY) ?? '[]') as RecentProject[];
                    const updated = [recentProject, ...existing].slice(0, 50);
                    safeSet(RECENT_PROJECTS_KEY, JSON.stringify(updated));
                } catch {}

                if (cancelled) return;

                setStatus('done');
                setMessage('Project imported successfully.');
                setTimeout(() => {
                    if (!cancelled) onImportProject(recentProject);
                }, 600);
            } catch (e: any) {
                if (!cancelled) {
                    setStatus('error');
                    setMessage(e.message || 'Failed to open package.');
                }
            }
        };

        run();
        return () => { cancelled = true; };
    }, [zipData, onClose, onImportProject]);

    return (
        <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 w-80 flex flex-col items-center gap-4 shadow-2xl">
                <h2 className="text-lg font-bold text-gray-800 dark:text-white">Open Package</h2>
                {status === 'extracting' && (
                    <div className="h-8 w-8 rounded-full border-4 border-[#007D8C] border-t-transparent animate-spin" />
                )}
                <p className={`text-sm text-center ${status === 'error' ? 'text-red-500' : 'text-gray-600 dark:text-gray-300'}`}>
                    {message}
                </p>
                {status === 'error' && (
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-[#007D8C] text-white rounded-lg text-sm font-medium hover:bg-[#006070] transition-colors"
                    >
                        Close
                    </button>
                )}
            </div>
        </div>
    );
};

export default OpenPackageModal;
