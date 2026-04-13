import React, { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';

interface Props {
    onClose: () => void;
}

const PackageProjectModal: React.FC<Props> = ({ onClose }) => {
    const [status, setStatus] = useState<'waiting' | 'packing' | 'done' | 'error'>('waiting');
    const [message, setMessage] = useState('');
    const hasRequested = useRef(false);

    useEffect(() => {
        if (hasRequested.current) return;
        hasRequested.current = true;

        const handleResponse = async (event: Event) => {
            const { projectData, projectType, projectName, photos } = (event as CustomEvent).detail;

            setStatus('packing');
            setMessage('Packaging project...');

            try {
                const zip = new JSZip();
                const assetsFolder = zip.folder('assets')!;

                // Build imageUrl → filename map and add binary assets to zip
                const urlToFilename = new Map<string, string>();
                for (const photo of (photos ?? []) as { imageUrl: string; filename: string }[]) {
                    if (!photo.imageUrl || !photo.filename) continue;
                    urlToFilename.set(photo.imageUrl, photo.filename);
                    const commaIdx = photo.imageUrl.indexOf(',');
                    const base64 = commaIdx !== -1 ? photo.imageUrl.slice(commaIdx + 1) : photo.imageUrl;
                    const binary = atob(base64);
                    const bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                    assetsFolder.file(photo.filename, bytes);
                }

                // Deep-clone project data and replace imageUrl → assetPath
                const exportData = JSON.parse(JSON.stringify(projectData));
                const replaceImageUrls = (obj: any) => {
                    if (!obj || typeof obj !== 'object') return;
                    if (Array.isArray(obj)) {
                        obj.forEach(replaceImageUrls);
                    } else {
                        if (typeof obj.imageUrl === 'string' && urlToFilename.has(obj.imageUrl)) {
                            obj.assetPath = `assets/${urlToFilename.get(obj.imageUrl)}`;
                            delete obj.imageUrl;
                        }
                        Object.values(obj).forEach(replaceImageUrls);
                    }
                };
                replaceImageUrls(exportData);

                const timestamp = Date.now();
                zip.file('manifest.json', JSON.stringify({
                    version: '1.0',
                    projectType,
                    projectName,
                    timestamp,
                    createdAt: new Date().toISOString(),
                }, null, 2));
                zip.file('project.json', JSON.stringify(exportData, null, 2));
                zip.file('comments.json', JSON.stringify([], null, 2));
                zip.file('revisions.json', JSON.stringify([], null, 2));

                const buffer = await zip.generateAsync({ type: 'arraybuffer' });
                const safeName = (projectName || 'project').replace(/[^a-z0-9_\-]/gi, '_');

                // @ts-ignore
                const result = await window.electronAPI?.saveZipFile?.(buffer, `${safeName}_package.zip`);
                if (result?.success) {
                    setStatus('done');
                    setMessage('Project packaged successfully.');
                    setTimeout(onClose, 1200);
                } else {
                    setStatus('error');
                    setMessage(result?.error || 'Save cancelled or failed.');
                }
            } catch (e: any) {
                setStatus('error');
                setMessage(e.message || 'An error occurred while packaging.');
            }
        };

        window.addEventListener('xtec-project-data-response', handleResponse, { once: true });
        window.dispatchEvent(new CustomEvent('xtec-request-project-data'));

        return () => window.removeEventListener('xtec-project-data-response', handleResponse);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 w-80 flex flex-col items-center gap-4 shadow-2xl">
                <h2 className="text-lg font-bold text-gray-800 dark:text-white">Package Project</h2>
                {(status === 'waiting' || status === 'packing') && (
                    <div className="h-8 w-8 rounded-full border-4 border-[#007D8C] border-t-transparent animate-spin" />
                )}
                <p className={`text-sm text-center ${status === 'error' ? 'text-red-500' : 'text-gray-600 dark:text-gray-300'}`}>
                    {status === 'waiting' ? 'Gathering project data...' : message}
                </p>
                {(status === 'done' || status === 'error') && (
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

export default PackageProjectModal;
