import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ZoomInIcon, ZoomOutIcon, DownloadIcon, CloseIcon } from './icons';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfPreviewModalProps {
    pdfBlob: Blob;
    filename: string;
    onClose: () => void;
}

const PdfPreviewModal: React.FC<PdfPreviewModalProps> = ({ pdfBlob, filename, onClose }) => {
    const [numPages, setNumPages] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [scale, setScale] = useState(1.0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
    const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { onClose(); return; }
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setCurrentPage(p => Math.min(p + 1, numPages));
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setCurrentPage(p => Math.max(p - 1, 1));
        };
        window.addEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'auto';
        };
    }, [onClose, numPages]);

    // Load PDF document from blob
    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);
        setError(null);
        setCurrentPage(1);

        const load = async () => {
            try {
                const ab = await pdfBlob.arrayBuffer();
                if (cancelled) return;
                const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
                if (cancelled) { pdf.destroy(); return; }
                pdfDocRef.current = pdf;
                setNumPages(pdf.numPages);
                setIsLoading(false);
            } catch {
                if (!cancelled) setError('Failed to load PDF.');
            }
        };
        load();

        return () => {
            cancelled = true;
            pdfDocRef.current?.destroy();
            pdfDocRef.current = null;
        };
    }, [pdfBlob]);

    // Render the current page onto the canvas
    useEffect(() => {
        if (isLoading || !pdfDocRef.current) return;
        let cancelled = false;

        const render = async () => {
            try {
                const page = await pdfDocRef.current!.getPage(currentPage);
                if (cancelled) { page.cleanup(); return; }

                const viewport = page.getViewport({ scale });
                const canvas = canvasRef.current;
                if (!canvas) return;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                canvas.width = viewport.width;
                canvas.height = viewport.height;

                if (renderTaskRef.current) {
                    renderTaskRef.current.cancel();
                    renderTaskRef.current = null;
                }

                const task = page.render({ canvasContext: ctx, viewport });
                renderTaskRef.current = task;

                try {
                    await task.promise;
                } catch (e: any) {
                    if (e?.name !== 'RenderingCancelledException') throw e;
                } finally {
                    page.cleanup();
                }
            } catch {
                // render cancelled or failed — ignore
            }
        };
        render();

        return () => {
            cancelled = true;
            renderTaskRef.current?.cancel();
            renderTaskRef.current = null;
        };
    }, [currentPage, scale, isLoading]);

    const handleDownload = async () => {
        try {
            // @ts-ignore
            if (window.electronAPI?.savePdf) {
                const ab = await pdfBlob.arrayBuffer();
                // @ts-ignore
                const result = await window.electronAPI.savePdf(ab, filename);
                if (result?.error) alert(`Failed to save PDF: ${result.error}`);
            } else {
                const url = URL.createObjectURL(pdfBlob);
                const a = document.createElement('a');
                a.href = url; a.download = filename;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (e) {
            console.error('PDF download failed:', e);
        }
    };

    const zoomIn  = () => setScale(s => Math.min(+(s + 0.25).toFixed(2), 3.0));
    const zoomOut = () => setScale(s => Math.max(+(s - 0.25).toFixed(2), 0.5));

    return (
        <div className="fixed inset-0 bg-black/50 flex flex-col items-center justify-center z-[100] p-4" role="dialog" aria-modal="true">
            <div className="xtec-modal-enter bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full h-full flex flex-col overflow-hidden">

                {/* ── Header ── */}
                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 bg-gray-50 dark:bg-gray-700 dark:border-gray-600 shrink-0">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white">PDF Preview</h3>

                    <div className="flex items-center gap-3">
                        {/* Page navigation */}
                        {numPages > 1 && (
                            <div className="flex items-center gap-1 bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded-lg px-2 py-1">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                                    disabled={currentPage <= 1}
                                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-500 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 dark:text-gray-200 transition-colors"
                                    aria-label="Previous page"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                <span className="text-sm text-gray-700 dark:text-gray-200 min-w-[5rem] text-center select-none">
                                    {currentPage} / {numPages}
                                </span>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(p + 1, numPages))}
                                    disabled={currentPage >= numPages}
                                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-500 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 dark:text-gray-200 transition-colors"
                                    aria-label="Next page"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        )}

                        {/* Zoom controls */}
                        <div className="flex items-center gap-1 bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded-lg px-2 py-1">
                            <button
                                onClick={zoomOut}
                                disabled={scale <= 0.5}
                                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-500 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 dark:text-gray-200 transition-colors"
                                aria-label="Zoom out"
                            >
                                <ZoomOutIcon className="h-4 w-4" />
                            </button>
                            <span className="text-sm text-gray-700 dark:text-gray-200 min-w-[3.5rem] text-center select-none">
                                {Math.round(scale * 100)}%
                            </span>
                            <button
                                onClick={zoomIn}
                                disabled={scale >= 3.0}
                                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-500 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 dark:text-gray-200 transition-colors"
                                aria-label="Zoom in"
                            >
                                <ZoomInIcon className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Save PDF */}
                        <button
                            onClick={handleDownload}
                            className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200"
                        >
                            <DownloadIcon className="h-4 w-4" />
                            <span>Save PDF</span>
                        </button>

                        {/* Close */}
                        <button
                            onClick={onClose}
                            className="text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white transition-colors"
                            aria-label="Close preview"
                        >
                            <CloseIcon className="h-8 w-8" />
                        </button>
                    </div>
                </div>

                {/* ── PDF canvas area ── */}
                <div className="flex-grow overflow-auto bg-gray-300 dark:bg-gray-900 flex items-start justify-center p-6">
                    {isLoading && (
                        <div className="flex items-center justify-center w-full h-full text-gray-600 dark:text-gray-400">
                            <span className="text-lg animate-pulse">Loading PDF…</span>
                        </div>
                    )}
                    {error && (
                        <div className="flex items-center justify-center w-full h-full text-red-600 dark:text-red-400">
                            <span>{error}</span>
                        </div>
                    )}
                    {!isLoading && !error && (
                        <canvas ref={canvasRef} className="shadow-2xl rounded" style={{ maxWidth: '100%' }} />
                    )}
                </div>
            </div>
        </div>
    );
};

export default PdfPreviewModal;
