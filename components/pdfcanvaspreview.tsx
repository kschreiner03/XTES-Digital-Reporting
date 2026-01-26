import { useEffect, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.js",
  import.meta.url
).href;

export default function PdfCanvasPreview({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      try {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const loadingTask = pdfjsLib.getDocument(url);
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.5 });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
          canvas,
          canvasContext: ctx,
          viewport
        }).promise;
      } catch (err) {
        console.error("PDF render failed:", err);
      }
    };

    render();

    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="flex justify-center items-start overflow-auto w-full h-full bg-gray-200 dark:bg-gray-900">
      <canvas ref={canvasRef} className="bg-white shadow-lg my-6" />
    </div>
  );
}