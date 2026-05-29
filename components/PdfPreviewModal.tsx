import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';
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
                // cancelled or failed — ignore
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
                await window.electronAPI.savePdf(ab, filename);
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

    // Short display name for the header
    const displayName = filename.replace(/\.pdf$/i, '');

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4" role="dialog" aria-modal="true">
            <div className="xtec-modal-enter bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full h-full flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700">

                {/* ── Teal accent bar ── */}
                <div className="h-1 w-full bg-gradient-to-r from-[#007D8C] via-[#00a0b0] to-[#007D8C] shrink-0" />

                {/* ── Header ── */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 shrink-0">
                    {/* Title + filename */}
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-[#007D8C]/10 dark:bg-[#007D8C]/20 border border-[#007D8C]/20 flex items-center justify-center shrink-0">
                            <FileText className="h-4 w-4 text-[#007D8C]" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 leading-tight">PDF Preview</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[280px]" title={filename}>{displayName}</p>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-2 shrink-0">

                        {/* Page navigation — only shown for multi-page PDFs */}
                        {!isLoading && numPages > 1 && (
                            <div className="flex items-center gap-0.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden shadow-sm">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                                    disabled={currentPage <= 1}
                                    className="p-2 hover:bg-[#007D8C]/8 dark:hover:bg-[#007D8C]/15 disabled:opacity-35 disabled:cursor-not-allowed text-gray-600 dark:text-gray-300 hover:text-[#007D8C] transition-colors"
                                    aria-label="Previous page"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                <span className="text-xs font-medium text-gray-600 dark:text-gray-300 min-w-[4.5rem] text-center select-none px-1 border-x border-gray-200 dark:border-gray-600">
                                    {currentPage} / {numPages}
                                </span>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(p + 1, numPages))}
                                    disabled={currentPage >= numPages}
                                    className="p-2 hover:bg-[#007D8C]/8 dark:hover:bg-[#007D8C]/15 disabled:opacity-35 disabled:cursor-not-allowed text-gray-600 dark:text-gray-300 hover:text-[#007D8C] transition-colors"
                                    aria-label="Next page"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        )}

                        {/* Zoom */}
                        {!isLoading && (
                            <div className="flex items-center gap-0.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden shadow-sm">
                                <button
                                    onClick={zoomOut}
                                    disabled={scale <= 0.5}
                                    className="p-2 hover:bg-[#007D8C]/8 dark:hover:bg-[#007D8C]/15 disabled:opacity-35 disabled:cursor-not-allowed text-gray-600 dark:text-gray-300 hover:text-[#007D8C] transition-colors"
                                    aria-label="Zoom out"
                                >
                                    <ZoomOutIcon className="h-4 w-4" />
                                </button>
                                <span className="text-xs font-medium text-gray-600 dark:text-gray-300 min-w-[3rem] text-center select-none border-x border-gray-200 dark:border-gray-600 px-1">
                                    {Math.round(scale * 100)}%
                                </span>
                                <button
                                    onClick={zoomIn}
                                    disabled={scale >= 3.0}
                                    className="p-2 hover:bg-[#007D8C]/8 dark:hover:bg-[#007D8C]/15 disabled:opacity-35 disabled:cursor-not-allowed text-gray-600 dark:text-gray-300 hover:text-[#007D8C] transition-colors"
                                    aria-label="Zoom in"
                                >
                                    <ZoomInIcon className="h-4 w-4" />
                                </button>
                            </div>
                        )}

                        {/* Divider */}
                        <div className="h-6 w-px bg-gray-200 dark:bg-gray-600 mx-1" />

                        {/* Save PDF */}
                        <button
                            onClick={handleDownload}
                            className="bg-[#007D8C] hover:bg-[#006b7a] active:bg-[#005f6b] text-white text-sm font-semibold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition-colors shadow-sm"
                        >
                            <DownloadIcon className="h-4 w-4" />
                            <span>Save PDF</span>
                        </button>

                        {/* Close */}
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            aria-label="Close preview"
                        >
                            <CloseIcon className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* ── PDF canvas area ── */}
                <div className="flex-grow overflow-auto flex items-start justify-center p-8 bg-gray-200 dark:bg-gray-900">
                    {isLoading && (
                        <div className="flex flex-col items-center justify-center w-full h-full gap-3">
                            {/* Teal spinner */}
                            <svg className="h-10 w-10 animate-spin text-[#007D8C]" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                                <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                            </svg>
                            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Rendering PDF…</p>
                        </div>
                    )}
                    {error && (
                        <div className="flex flex-col items-center justify-center w-full h-full gap-3 text-red-500 dark:text-red-400">
                            <FileText className="h-10 w-10 opacity-40" />
                            <p className="text-sm font-medium">{error}</p>
                        </div>
                    )}
                    {!isLoading && !error && (
                        <canvas
                            ref={canvasRef}
                            className="rounded shadow-2xl"
                            style={{ maxWidth: '100%', display: 'block' }}
                        />
                    )}
                </div>

                {/* ── Footer status bar ── */}
                {!isLoading && !error && (
                    <div className="shrink-0 px-5 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex items-center justify-between">
                        <span className="text-xs text-gray-400 dark:text-gray-500 select-none">
                            {numPages === 1 ? '1 page' : `${numPages} pages`}
                            {' · '}
                            {Math.round(scale * 100)}% zoom
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 select-none">
                            ← → to navigate · Esc to close
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PdfPreviewModal;
