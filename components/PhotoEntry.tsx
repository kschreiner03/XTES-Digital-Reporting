
import React, { useRef, useEffect } from 'react';
import type { PhotoData } from '../types';
import { TrashIcon, CameraIcon, ArrowUpIcon, ArrowDownIcon, ArrowsPointingOutIcon } from './icons';

interface PhotoEntryProps {
  data: PhotoData;
  // FIX: Omit 'imageId' from the editable fields, as it is managed internally.
  onDataChange: (field: keyof Omit<PhotoData, 'id' | 'imageUrl' | 'imageId'>, value: string) => void;
  onImageChange: (file: File) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  printable?: boolean;
  errors?: Set<keyof PhotoData>;
  showDirectionField?: boolean;
  isLocationLocked?: boolean;
  onImageClick?: (imageUrl: string) => void;
}

const EditableField: React.FC<{ label: string; value: string; onChange: (value: string) => void; isTextArea?: boolean; printable?: boolean; isInvalid?: boolean; readOnly?: boolean; placeholder?: string; }> = ({ label, value, onChange, isTextArea = false, printable = false, isInvalid = false, readOnly = false, placeholder = '' }) => {
    const commonClasses = "p-1 w-full bg-transparent focus:outline-none transition duration-200 text-base font-normal text-black dark:text-gray-100 min-w-0 placeholder-gray-400 dark:placeholder-gray-500";
    const elementRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

    if (printable) {
        if (isTextArea) {
            return (
                <div>
                    <label className="block text-base font-bold text-black">{label}:</label>
                    <p className="mt-1 text-base font-normal text-black whitespace-pre-wrap">{value || '\u00A0'}</p>
                </div>
            );
        }
        return (
            <div className="flex items-baseline gap-2">
                <span className="block text-base font-bold text-black flex-shrink-0 whitespace-nowrap">{label}:</span>
                <span className="text-base font-normal text-black break-words">{value || '\u00A0'}</span>
            </div>
        );
    }

    const labelClasses = "block text-base font-bold text-black dark:text-gray-200 flex-shrink-0 whitespace-nowrap";

    if (readOnly) {
        return (
            <div className="flex items-baseline gap-2">
                <label className={labelClasses}>{label}:</label>
                <span className="p-1 w-full text-base font-normal text-gray-500 dark:text-gray-400">{value}</span>
            </div>
        );
    }

    if (isTextArea) {
        // Description field (stacked layout)
        return (
            <div>
                <label className={labelClasses}>{label}:</label>
                <textarea
                    ref={elementRef}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    rows={4}
                    className={`mt-1 ${commonClasses} ${isInvalid ? 'border-b-2 border-red-500' : 'border-b border-gray-300 dark:border-gray-600 focus:border-[#007D8C]'}`}
                    placeholder={placeholder}
                />
            </div>
        );
    }
    
    return (
        <div className="flex items-baseline gap-2">
            <label className={labelClasses}>{label}:</label>
            <input
                ref={elementRef}
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={`${commonClasses} ${isInvalid ? 'border-b-2 border-red-500' : 'border-b border-gray-300 dark:border-gray-600 focus:border-[#007D8C]'}`}
                placeholder={placeholder}
            />
        </div>
    );
};


const PhotoEntry: React.FC<PhotoEntryProps> = ({ data, onDataChange, onImageChange, onRemove, onMoveUp, onMoveDown, isFirst, isLast, printable = false, errors, showDirectionField = false, isLocationLocked = false, onImageClick }) => {
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            onImageChange(e.target.files[0]);
        }
    };

    const showControls = !printable;
    const isImageInvalid = !!errors?.has('imageUrl');

    return (
        <div className="bg-white dark:bg-gray-800 p-6 shadow-md rounded-lg break-inside-avoid transition-colors duration-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:items-start">
                {/* Left Column: Information */}
                <div className="flex flex-col space-y-4 md:col-span-1 min-w-0">
                     <div className="flex justify-between items-center">
                        <div className="flex-grow min-w-0">
                            <EditableField label={data.isMap ? "Map" : "Photo"} value={data.photoNumber} onChange={(v) => onDataChange('photoNumber', v)} printable={printable} isInvalid={errors?.has('photoNumber')} readOnly />
                        </div>
                        {showControls && (
                            <div className="flex items-center space-x-2 ml-4 flex-shrink-0">
                               <button onClick={onMoveUp} disabled={isFirst} className="p-1 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition duration-200" aria-label="Move Up">
                                    <ArrowUpIcon className="h-7 w-7" />
                                </button>
                                <button onClick={onMoveDown} disabled={isLast} className="p-1 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition duration-200" aria-label="Move Down">
                                    <ArrowDownIcon className="h-7 w-7" />
                                </button>
                                <button onClick={onRemove} className="p-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition duration-200" aria-label="Remove Photo">
                                    <TrashIcon className="h-7 w-7" />
                                </button>
                            </div>
                        )}
                    </div>
                    {showDirectionField && (
                         <EditableField label="Direction" value={data.direction || ''} onChange={(v) => onDataChange('direction', v)} printable={printable} isInvalid={errors?.has('direction')} />
                    )}
                    <EditableField label="Date" value={data.date} onChange={(v) => onDataChange('date', v)} printable={printable} isInvalid={errors?.has('date')} placeholder="October 1, 2025" />
                    <EditableField label="Location" value={data.location} onChange={(v) => onDataChange('location', v)} printable={printable} isInvalid={errors?.has('location')} readOnly={isLocationLocked} />
                    <EditableField label="Description" value={data.description} onChange={(v) => onDataChange('description', v)} isTextArea printable={printable} isInvalid={errors?.has('description')} />
                </div>
                {/* Right Column: Image */}
                <div className="flex items-center justify-center md:col-span-2">
                    <div className={`group w-full rounded-lg flex items-center justify-center relative overflow-hidden transition-colors duration-300 ${isImageInvalid ? 'ring-2 ring-red-500 ring-inset' : 'bg-gray-50 dark:bg-gray-700'}`}>
                        <input
                            type="file"
                            accept="image/jpeg, image/png"
                            onChange={handleFileChange}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            aria-label="Upload image"
                            disabled={printable}
                        />
                        {data.imageUrl ? (
                             <>
                                <img src={data.imageUrl} alt="Uploaded" className="object-contain max-w-full max-h-[280px]" />
                                {!printable && onImageClick && (
                                    <button
                                        type="button"
                                        onClick={() => onImageClick(data.imageUrl!)}
                                        className="absolute top-2 right-2 bg-black bg-opacity-50 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 z-20"
                                        aria-label="Enlarge image"
                                    >
                                        <ArrowsPointingOutIcon className="h-5 w-5" />
                                    </button>
                                )}
                            </>
                        ) : (
                            <div className="text-center text-gray-500 dark:text-gray-400 p-4 h-[280px] w-full flex flex-col justify-center items-center pointer-events-none">
                                <CameraIcon className="mx-auto h-20 w-20 text-gray-400 dark:text-gray-500"/>
                                <p className="mt-2 text-base font-bold">Click or drag to upload an image</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PhotoEntry;
