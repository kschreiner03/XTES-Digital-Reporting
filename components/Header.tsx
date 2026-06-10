import React, { useRef, useLayoutEffect } from 'react';
import type { HeaderData } from '../types';
import SafeImage from './SafeImage';

interface HeaderProps {
    data: HeaderData;
    onDataChange: (field: keyof HeaderData, value: string) => void;
    isPrintable?: boolean;
    errors?: Set<keyof HeaderData>;
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
                <span className="text-base font-normal text-black break-words">{value || ' '}</span>
            </div>
        );
    }

    const boxClass = `block w-full p-2 border rounded-lg focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition bg-gray-50 dark:bg-transparent text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 ${isInvalid ? 'border-red-500' : 'border-gray-200 dark:border-white/10'}`;
    const labelClass = "block text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1";

    if (isTextArea) {
        return (
            <div>
                <label className={labelClass}>{label}</label>
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
            <label className={labelClass}>{label}</label>
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

const Header: React.FC<HeaderProps> = ({ data, onDataChange, isPrintable = false, errors }) => {
    return (
        <div className={`transition-colors duration-200 ${isPrintable ? 'p-0' : 'xtec-report-card p-6'}`}>
            <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] md:items-center pb-3 gap-4">
                <div className="flex justify-center md:justify-start">
                    <XterraLogo isPrintable={isPrintable} />
                </div>
                <h1 className={`font-extrabold text-[#007D8C] tracking-wider text-center whitespace-nowrap ${isPrintable ? 'text-2xl' : 'text-4xl'}`}>
                    PHOTOGRAPHIC LOG
                </h1>
                <div></div>
            </div>

            <div className="xtec-divider mb-3"></div>

            <div className={`${isPrintable ? 'py-2' : 'pt-3 pb-2'}`}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                    <div className="flex flex-col gap-y-2">
                        <EditableField label="Proponent" value={data.proponent} onChange={(v) => onDataChange('proponent', v)} isPrintable={isPrintable} isInvalid={errors?.has('proponent')} />
                        <EditableField label="Location" value={data.location} onChange={(v) => onDataChange('location', v)} isPrintable={isPrintable} isInvalid={errors?.has('location')} isTextArea />
                    </div>
                    <div className="flex flex-col gap-y-2">
                        <EditableField label="Date" value={data.date} onChange={(v) => onDataChange('date', v)} isPrintable={isPrintable} isInvalid={errors?.has('date')} placeholder="October 1, 2025" />
                        <EditableField label="Project #" value={data.projectNumber} onChange={(v) => onDataChange('projectNumber', v)} isPrintable={isPrintable} isInvalid={errors?.has('projectNumber')} />
                    </div>
                    <div className="md:col-span-2">
                        <EditableField label="Project Name" value={data.projectName} onChange={(v) => onDataChange('projectName', v)} isPrintable={isPrintable} isInvalid={errors?.has('projectName')} isTextArea />
                    </div>
                </div>
            </div>

            <div className={`xtec-divider ${isPrintable ? '' : 'mt-2'}`}></div>
        </div>
    );
};

export default Header;
