import React, { useEffect, useState } from 'react';
import { CloseIcon } from './icons';

interface ImageModalProps {
  imageUrl: string;
  onClose: () => void;

  /** Optional metadata */
  fileName?: string;
  fileSize?: number;  // in bytes
  dateTaken?: string;
}

const ImageModal: React.FC<ImageModalProps> = ({
  imageUrl,
  onClose,
  fileName,
  fileSize,
  dateTaken
}) => {

  const [formattedSize, setFormattedSize] = useState<string>("");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    if (fileSize) {
      const mb = fileSize / (1024 * 1024);
      setFormattedSize(mb.toFixed(2) + " MB");
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "auto";
    };
  }, [onClose, fileSize]);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* Close Button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
        aria-label="Close image view"
      >
        <CloseIcon className="h-10 w-10" />
      </button>

      {/* Modal Content */}
      <div
        className="relative max-w-full max-h-full"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={imageUrl}
          alt="Enlarged view"
          className="object-contain max-w-[90vw] max-h-[80vh] rounded-lg shadow-2xl"
        />

        {/* Optional metadata section */}
        {(fileName || formattedSize || dateTaken) && (
          <div className="mt-4 bg-white/10 backdrop-blur-md p-4 rounded-lg text-white text-sm space-y-1">
            {fileName && <p><strong>File:</strong> {fileName}</p>}
            {formattedSize && <p><strong>Size:</strong> {formattedSize}</p>}
            {dateTaken && <p><strong>Date Taken:</strong> {dateTaken}</p>}
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageModal;














