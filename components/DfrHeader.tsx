import React, { useRef, useLayoutEffect, useEffect } from 'react';
import type { DfrHeaderData } from '../types';
import SafeImage from './SafeImage';

interface HeaderProps {
    data: DfrHeaderData;
    onDataChange: (field: keyof DfrHeaderData, value: string) => void;
    isPrintable?: boolean;
    errors?: Set<keyof DfrHeaderData>;
    placeholders?: Partial<DfrHeaderData>;
    isPhotologHeader?: boolean;
}


const XterraLogo: React.FC<{ isPrintable?: boolean }> = ({ isPrintable = false }) => (
    <div className="flex items-center">
        <SafeImage
            fileName="xterra-logo.png"
            alt="X-TERRA Logo"
            className={isPrintable ? "h-10 w-auto" : "h-14 w-auto dark:hidden"}
        />
        <SafeImage
            fileName="xterra-white.png"
            alt="X-TERRA Logo"
            className={isPrintable ? "h-10 w-auto" : "h-14 w-auto hidden dark:block"}
        />
    </div>
);

const SelectableLabelField: React.FC<{ 
    labelType: string; 
    value: string; 
    onLabelChange: (value: string) => void; 
    onValueChange: (value: string) => void;
    isPrintable?: boolean;
    isInvalid?: boolean;
    placeholder?: string;
}> = ({ labelType, value, onLabelChange, onValueChange, isPrintable = false, isInvalid = false, placeholder = '' }) => {
    
    const options = ["IOCG Lease #", "Disposition #", "ENV File #", "MOE File #", "License #", "WSA File #"];

    if (isPrintable) {
        return (
            <div className="flex items-baseline gap-1">
                <span className="text-base font-bold text-black flex-shrink-0 whitespace-nowrap">{labelType}:</span>
                <span className="text-base font-normal text-black break-words">{value || '\u00A0'}</span>
            </div>
        );
    }
    
    const boxClass = `w-full p-2 border rounded-lg focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition bg-gray-50 dark:bg-transparent text-gray-800 dark:text-white ${isInvalid ? 'border-red-500' : 'border-gray-200 dark:border-white/10'}`;

    return (
        <div>
            <label className="block text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1">{labelType}</label>
            <div className="flex gap-2">
                <div className="relative shrink-0">
                    <select value={labelType} onChange={(e) => onLabelChange(e.target.value)}
                        className={`pl-2.5 pr-7 py-2 border rounded-lg focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition bg-white dark:bg-[#252525] text-gray-800 dark:text-white text-sm font-semibold appearance-none cursor-pointer ${isInvalid ? 'border-red-500' : 'border-gray-200 dark:border-white/10'}`}>
                        {options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-gray-400 dark:text-gray-500">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></svg>
                    </div>
                </div>
                <input type="text" value={value} onChange={(e) => onValueChange(e.target.value)}
                    className={boxClass} placeholder={placeholder} spellCheck={true} />
            </div>
        </div>
    );
};

const EditableField: React.FC<{ 
    label: string; 
    value: string; 
    onChange: (value: string) => void; 
    isPrintable?: boolean; 
    isInvalid?: boolean; 
    isTextArea?: boolean; 
    placeholder?: string; 
}> = ({ label, value, onChange, isPrintable = false, isInvalid = false, isTextArea = false, placeholder = '' }) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useLayoutEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'inherit';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [value]);
    
    if (isPrintable) {
        return (
            <div className="flex items-baseline gap-1">
                <span className="text-base font-bold text-black flex-shrink-0 whitespace-nowrap">{label}:</span>
                <span className="text-base font-normal text-black break-words">{value || '\u00A0'}</span>
            </div>
        );
    }

    const boxClass = `block w-full p-2 border rounded-lg focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition bg-gray-50 dark:bg-transparent text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 ${isInvalid ? 'border-red-500' : 'border-gray-200 dark:border-white/10'}`;
    const labelClasses = "block text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1";

    if (isTextArea) {
        return (
            <div>
                <label className={labelClasses}>{label}</label>
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    rows={1}
                    className={`${boxClass} resize-none overflow-hidden`}
                    placeholder={placeholder}
                    spellCheck={true}
                />
            </div>
        );
    }

    return (
        <div>
            <label className={labelClasses}>{label}</label>
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={boxClass}
                placeholder={placeholder}
                spellCheck={true}
            />
        </div>
    );
};

export const DfrHeader: React.FC<HeaderProps> = ({ data, onDataChange, isPrintable = false, errors, placeholders, isPhotologHeader = false }) => {
    return (
        <div className={`transition-colors duration-200 ${isPrintable ? 'p-0' : 'xtec-report-card p-6'}`}>
            <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] md:items-center pb-3 gap-4">
                <div className="flex justify-center md:justify-start">
                    <XterraLogo isPrintable={isPrintable} />
                </div>
                <h1 className={`font-extrabold text-[#007D8C] tracking-wider text-center whitespace-nowrap ${isPrintable ? 'text-2xl' : 'text-4xl'}`}>
                    {/* FIX: Conditionally render title based on isPhotologHeader prop */}
                    {isPhotologHeader ? 'PHOTOGRAPHIC LOG' : 'DAILY FIELD REPORT'}
                </h1>
                <div></div>
            </div>
            
            <div className="xtec-divider"></div>
            
            <div className={`${isPrintable ? 'py-2' : 'pt-3 pb-2'}`}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                    <div className="flex flex-col gap-y-2">
                        <EditableField label="DATE" value={data.date} onChange={(v) => onDataChange('date', v)} isPrintable={isPrintable} isInvalid={errors?.has('date')} placeholder="October 1, 2025" />
                        {/* FIX: Use optional chaining to safely access placeholder properties. */}
                        <EditableField label="PROPONENT" value={data.proponent} onChange={(v) => onDataChange('proponent', v)} isPrintable={isPrintable} isInvalid={errors?.has('proponent')} placeholder={placeholders?.proponent} />
                        {/* FIX: Use optional chaining to safely access placeholder properties. */}
                        <EditableField label="LOCATION" value={data.location} onChange={(v) => onDataChange('location', v)} isPrintable={isPrintable} isInvalid={errors?.has('location')} isTextArea placeholder={placeholders?.location}/>
                    </div>

                    <div className="flex flex-col gap-y-2">
                        {/* FIX: Use optional chaining to safely access placeholder properties. */}
                        <EditableField label="Project #" value={data.projectNumber} onChange={(v) => onDataChange('projectNumber', v)} isPrintable={isPrintable} isInvalid={errors?.has('projectNumber')} placeholder={placeholders?.projectNumber} />
                        {/* FIX: Use optional chaining to safely access placeholder properties. */}
                        <EditableField label="MONITOR" value={data.monitor} onChange={(v) => onDataChange('monitor', v)} isPrintable={isPrintable} isInvalid={errors?.has('monitor')} placeholder={placeholders?.monitor} />
                        <SelectableLabelField
                            labelType={data.envFileType}
                            value={data.envFileValue}
                            onLabelChange={(v) => onDataChange('envFileType', v)}
                            onValueChange={(v) => onDataChange('envFileValue', v)}
                            isPrintable={isPrintable}
                            isInvalid={errors?.has('envFileValue')}
                            // FIX: Use optional chaining to safely access placeholder properties.
                            placeholder={placeholders?.envFileValue}
                        />
                    </div>

                    <div className="md:col-span-2">
                        {/* FIX: Use optional chaining to safely access placeholder properties. */}
                        <EditableField label="PROJECT NAME" value={data.projectName} onChange={(v) => onDataChange('projectName', v)} isPrintable={isPrintable} isInvalid={errors?.has('projectName')} isTextArea placeholder={placeholders?.projectName} />
                    </div>
                </div>
            </div>
            
            <div className={`xtec-divider ${isPrintable ? '' : 'mt-2'}`}></div>
        </div>
    );
};