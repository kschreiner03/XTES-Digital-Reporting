import React, { useRef, useState, useEffect } from 'react';
import type { PhotoData, TextComment, TextHighlight } from '../types';
import { TrashIcon, CameraIcon, ArrowsPointingOutIcon, GripVerticalIcon } from './icons';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import BulletPointEditor, { CommentAnchorPosition } from './BulletPointEditor';

// ─── Updated interface: all callbacks include the photo id so parents can
// pass stable useCallback references without wrapping in inline arrows ────────
interface PhotoEntryProps {
  data: PhotoData;
  onDataChange: (id: number, field: keyof Omit<PhotoData, 'id' | 'imageUrl' | 'imageId'>, value: string) => void;
  onImageChange: (id: number, file: File) => void;
  onRemove: (id: number) => void;
  printable?: boolean;
  errors?: Set<keyof PhotoData>;
  showDirectionField?: boolean;
  isLocationLocked?: boolean;
  onImageClick?: (imageUrl: string) => void;

  headerDate?: string;
  headerLocation?: string;

  inlineComments?: TextComment[];
  onInlineCommentsChange?: (id: number, comments: TextComment[]) => void;
  highlights?: TextHighlight[];
  onHighlightsChange?: (id: number, highlights: TextHighlight[]) => void;
  onAnchorPositionsChange?: (id: number, anchors: CommentAnchorPosition[]) => void;
  hoveredCommentId?: string | null;
}

// ─── Fix 2: Local state in fields — parent state only updates on blur ─────────
// This means typing never triggers a parent re-render; only committing does.
const EditableField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  isTextArea?: boolean;
  printable?: boolean;
  isInvalid?: boolean;
  readOnly?: boolean;
  placeholder?: string;
}> = ({ label, value, onChange, isTextArea = false, printable = false, isInvalid = false, readOnly = false, placeholder = '' }) => {

  const [localValue, setLocalValue] = useState(value);
  const focusedRef = useRef(false);

  // Sync from parent when not focused (e.g. autofill, load from file)
  useEffect(() => {
    if (!focusedRef.current) setLocalValue(value);
  }, [value]);

  const commonClasses = "p-1 w-full bg-transparent focus:outline-none transition text-base min-w-0 placeholder-gray-400 dark:placeholder-gray-500";
  const labelClasses = "block text-base font-bold text-black dark:text-gray-200 whitespace-nowrap";

  if (printable) {
    return (
      <div>
        <label className="block text-base font-bold">{label}:</label>
        <p className="mt-1 text-base whitespace-pre-wrap">{value || "\u00A0"}</p>
      </div>
    );
  }

  if (readOnly) {
    return (
      <div className="flex items-baseline gap-2">
        <label className={labelClasses}>{label}:</label>
        <span className="p-1 w-full text-base text-gray-500">{value}</span>
      </div>
    );
  }

  if (isTextArea) {
    return (
      <div>
        <label className={labelClasses}>{label}:</label>
        <textarea
          rows={4}
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={() => { focusedRef.current = false; onChange(localValue); }}
          onFocus={() => { focusedRef.current = true; }}
          className={`mt-1 ${commonClasses} border-b ${
            isInvalid ? "border-red-500" : "border-gray-300 dark:border-gray-600 focus:border-[#007D8C]"
          }`}
          placeholder={placeholder}
          spellCheck={true}
        />
      </div>
    );
  }

  return (
    <div className="flex items-baseline gap-2">
      <label className={labelClasses}>{label}:</label>
      <input
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => { focusedRef.current = false; onChange(localValue); }}
        onFocus={() => { focusedRef.current = true; }}
        className={`${commonClasses} border-b ${
          isInvalid ? "border-red-500" : "border-gray-300 dark:border-gray-600 focus:border-[#007D8C]"
        }`}
        placeholder={placeholder}
        spellCheck={true}
      />
    </div>
  );
};

const PhotoEntry: React.FC<PhotoEntryProps> = ({
  data,
  onDataChange,
  onImageChange,
  onRemove,
  printable = false,
  errors,
  showDirectionField = false,
  isLocationLocked = false,
  onImageClick,
  headerDate,
  headerLocation,
  inlineComments,
  onInlineCommentsChange,
  highlights,
  onHighlightsChange,
  onAnchorPositionsChange,
  hoveredCommentId,
}) => {

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortDragging,
  } = useSortable({ id: data.id, disabled: printable });

  const sortableStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortDragging ? 0.5 : 1,
    zIndex: isSortDragging ? 50 : undefined,
  };

  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) onImageChange(data.id, e.target.files[0]);
  };

  const dropZoneClasses = isDragging
    ? "border-[#007D8C] bg-teal-50 dark:bg-teal-900/30 scale-[1.02]"
    : errors?.has("imageUrl")
    ? "ring-2 ring-red-500 bg-gray-50 dark:bg-gray-700"
    : "bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600";

  return (
    <div ref={setNodeRef} style={sortableStyle} className="bg-white dark:bg-gray-800 p-6 shadow-md rounded-lg break-inside-avoid">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

        {/* LEFT COLUMN */}
        <div className="flex flex-col space-y-4">

          {/* Photo # + Controls */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              {!printable && (
                <button
                  {...attributes}
                  {...listeners}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-grab active:cursor-grabbing touch-none"
                  title="Drag to reorder"
                >
                  <GripVerticalIcon className="h-6 w-6" />
                </button>
              )}
              <EditableField
                label={data.isMap ? "Map" : "Photo"}
                value={data.photoNumber}
                onChange={() => {}}
                printable={printable}
                readOnly
              />
            </div>

            {!printable && (
              <div className="flex items-center space-x-2">
                <button onClick={() => onRemove(data.id)} className="p-1 text-red-500 hover:text-red-700">
                  <TrashIcon className="h-7 w-7" />
                </button>
              </div>
            )}
          </div>

          {/* Direction */}
          {showDirectionField && (
            <EditableField
              label="Direction"
              value={data.direction || ""}
              onChange={(v) => onDataChange(data.id, "direction", v)}
              printable={printable}
              isInvalid={errors?.has('direction')}
            />
          )}

          {/* Date */}
          <div className="flex items-center gap-2">
            <EditableField
              label="Date"
              value={data.date}
              onChange={(v) => onDataChange(data.id, "date", v)}
              printable={printable}
            />

            {!printable && (
              <button
                className="px-2 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 rounded text-xs"
                onClick={() => headerDate && onDataChange(data.id, "date", headerDate)}
              >
                ⎙
              </button>
            )}
          </div>

          {/* Location */}
          <div className="flex items-center gap-2">
            <EditableField
              label="Location"
              value={data.location}
              readOnly={isLocationLocked}
              onChange={(v) => onDataChange(data.id, "location", v)}
              printable={printable}
            />

            {!printable && (
              <button
                className="px-2 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 rounded text-xs"
                onClick={() => headerLocation && onDataChange(data.id, "location", headerLocation)}
              >
                ⎙
              </button>
            )}
          </div>

          {/* Description */}
          {printable ? (
            <EditableField
              label="Description"
              value={data.description}
              onChange={() => {}}
              isTextArea
              printable
            />
          ) : (
            <BulletPointEditor
              label="Description"
              fieldId={`photo-${data.id}-description`}
              value={data.description}
              onChange={(v) => onDataChange(data.id, "description", v)}
              inlineComments={inlineComments}
              onInlineCommentsChange={onInlineCommentsChange ? (comments) => onInlineCommentsChange(data.id, comments) : undefined}
              highlights={highlights}
              onHighlightsChange={onHighlightsChange ? (h) => onHighlightsChange(data.id, h) : undefined}
              onAnchorPositionsChange={onAnchorPositionsChange ? (anchors) => onAnchorPositionsChange(data.id, anchors) : undefined}
              hoveredCommentId={hoveredCommentId}
              rows={4}
            />
          )}

        </div>

        {/* RIGHT COLUMN — IMAGE */}
        <div className="flex items-center justify-end md:col-span-2">
          <div
            className={`relative w-full max-w-md aspect-[4/3] rounded-lg overflow-hidden transition-all border-2 border-transparent ${dropZoneClasses}`}
            onDragOver={(e) => { e.preventDefault(); !printable && setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files?.length) onImageChange(data.id, e.dataTransfer.files[0]);
            }}
          >

            {/* Full-area input */}
            {!printable && (
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer"
              />
            )}

            {/* Fix 3: decoding="async" — browser decodes off the main thread */}
            {data.imageUrl ? (
              <>
                <img
                  src={data.imageUrl}
                  decoding="async"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                />

                {/* Expand button (bottom-right, does NOT trigger upload) */}
                {!printable && onImageClick && (
                  <button
                    className="absolute bottom-2 right-2 bg-black bg-opacity-60 text-white p-2 rounded-full z-20"
                    onClick={(e) => {
                      e.stopPropagation();
                      onImageClick(data.imageUrl!);
                    }}
                  >
                    <ArrowsPointingOutIcon className="h-5 w-5" />
                  </button>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center w-full h-full text-gray-500 pointer-events-none">
                <CameraIcon className="h-20 w-20 text-gray-400" />
                <p className="mt-2 font-semibold">Click or drag to upload an image</p>
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
};

// Fix 1: React.memo — PhotoEntry only re-renders when its own data/props change.
// Combined with stable parent callbacks (useCallback in each parent component),
// this prevents all-photo re-renders on every keystroke.
export default React.memo(PhotoEntry);
