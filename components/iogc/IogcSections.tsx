import React, { useRef, useState, useEffect, useCallback } from 'react';
import type {
    IogcLeaseAuditData, IogcCoverData, IogcSectionA, IogcSectionB,
    IogcSectionC, IogcSectionD, IogcSectionE, IogcSectionF, IogcAttachment,
    TextHighlight, TextComment,
} from '../../types';
import {
    YES_NO_NA, QUALITY_SCALE, COMPLIANCE_SCALE, EROSION_EFFECTIVENESS,
    WEED_CONTROL_STRATEGIES, RESERVE_PRESETS, SITE_TYPE_OPTIONS, COMMODITY_OPTIONS,
    SITE_STATUS_OPTIONS, AUDIT_TYPE_OPTIONS, isInCompliance,
} from './IogcConstants';
import BulletPointEditor, { CommentAnchorPosition } from '../BulletPointEditor';

// ─── Shared UI Primitives ──────────────────────────────────────────

export const Section: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, children, defaultOpen = true }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg transition-colors duration-200 overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-6 py-4 text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#007D8C]"
            >
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">{title}</h2>
                <svg
                    className={`w-5 h-5 text-gray-500 dark:text-gray-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {open && (
                <div className="px-6 pb-6 space-y-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                    {children}
                </div>
            )}
        </div>
    );
};

export const EditableField: React.FC<{
    label: string; value: string; onChange: (v: string) => void;
    type?: string; isTextArea?: boolean; rows?: number; placeholder?: string;
    isInvalid?: boolean; note?: string;
}> = ({ label, value, onChange, type = 'text', isTextArea = false, rows = 1, placeholder = '', isInvalid = false, note }) => {
    const cls = `block w-full p-2 border rounded-md shadow-sm focus:ring-2 focus:ring-[#007D8C] focus:border-[#007D8C] transition bg-white dark:bg-gray-700 text-black dark:text-white dark:placeholder-gray-400 ${isInvalid ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`;
    const taRef = useRef<HTMLTextAreaElement>(null);
    const adjustHeight = useCallback(() => {
        if (taRef.current) {
            taRef.current.style.height = 'auto';
            taRef.current.style.height = taRef.current.scrollHeight + 'px';
        }
    }, []);
    useEffect(() => { adjustHeight(); }, [value, adjustHeight]);
    return (
        <div>
            {label && <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>}
            {isTextArea ? (
                <textarea ref={taRef} value={value} onChange={e => onChange(e.target.value)} rows={rows} className={cls} placeholder={placeholder} spellCheck style={{ overflow: 'hidden' }} onInput={adjustHeight} />
            ) : (
                <input type={type} value={value} onChange={e => onChange(e.target.value)} className={cls} placeholder={placeholder} spellCheck />
            )}
            {note && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 italic">{note}</p>}
        </div>
    );
};

/** Compact dropdown — use instead of RadioGroup for small option sets or long labels. */
export const SelectField: React.FC<{
    label: string; value: string; onChange: (v: string) => void;
    options: readonly string[] | string[]; placeholder?: string; isInvalid?: boolean; note?: string;
}> = ({ label, value, onChange, options, placeholder = 'Select…', isInvalid = false, note }) => (
    <div>
        {label && <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>}
        <select
            value={value}
            onChange={e => onChange(e.target.value)}
            className={`block w-full p-2 border rounded-md shadow-sm focus:ring-2 focus:ring-[#007D8C] focus:border-[#007D8C] transition bg-white dark:bg-gray-700 text-black dark:text-white ${isInvalid ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
        >
            <option value="">{placeholder}</option>
            {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
        {note && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 italic">{note}</p>}
    </div>
);

export const RadioGroup: React.FC<{
    label: string; options: readonly string[] | string[]; value: string; onChange: (v: string) => void; isInvalid?: boolean;
}> = ({ label, options, value, onChange, isInvalid = false }) => (
    <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between py-2 border-b last:border-b-0 ${isInvalid ? 'border-red-500 bg-red-50 dark:bg-red-900/20 px-2 rounded' : 'border-gray-200 dark:border-gray-700'}`}>
        <span className={`font-medium mb-2 sm:mb-0 ${isInvalid ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-200'}`}>{label}</span>
        <div className="flex items-center flex-wrap gap-x-5 gap-y-1">
            {options.map(opt => (
                <label key={opt} className="flex items-center space-x-2 cursor-pointer text-gray-600 dark:text-gray-300">
                    <input type="radio" name={label} value={opt} checked={value === opt} onChange={() => onChange(opt)} className="h-5 w-5 text-[#007D8C] border-gray-300 focus:ring-[#006b7a]" />
                    <span className="text-sm">{opt}</span>
                </label>
            ))}
        </div>
    </div>
);

export const MultiCheckbox: React.FC<{
    label: string; options: readonly string[] | string[]; selected: string[]; onToggle: (item: string) => void;
}> = ({ label, options, selected, onToggle }) => (
    <div className="py-2">
        <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{label}</span>
        <div className="flex flex-wrap gap-3">
            {options.map(opt => (
                <label key={opt} className="flex items-center space-x-2 cursor-pointer text-gray-600 dark:text-gray-300">
                    <input type="checkbox" checked={selected.includes(opt)} onChange={() => onToggle(opt)} className="h-4 w-4 text-[#007D8C] border-gray-300 rounded focus:ring-[#006b7a]" />
                    <span className="text-sm">{opt}</span>
                </label>
            ))}
        </div>
    </div>
);

const QuestionBlock: React.FC<{ num: string; label: string; children: React.ReactNode; noteColor?: 'blue' | 'amber' }> = ({ num, label, children, noteColor }) => (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
        <div className="flex items-start gap-2">
            <span className="bg-[#007D8C] text-white text-xs font-bold px-2 py-1 rounded min-w-[2rem] text-center">{num}</span>
            <span className={`font-medium text-sm ${noteColor === 'amber' ? 'text-amber-700 dark:text-amber-400' : 'text-gray-800 dark:text-gray-200'}`}>{label}</span>
        </div>
        <div className="pl-2 space-y-3">{children}</div>
    </div>
);

// ─── Reserve Name Selector ────────────────────────────────────────

const ReserveSelector: React.FC<{
    value: string; preset: string;
    onValueChange: (v: string) => void;
    onPresetChange: (p: string) => void;
}> = ({ value, preset, onValueChange, onPresetChange }) => {
    const isCustom = preset === '__custom__';
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reserve Name & Number</label>
            {!isCustom ? (
                <select
                    value={value}
                    onChange={e => {
                        if (e.target.value === '__custom__') {
                            onPresetChange('__custom__'); onValueChange('');
                        } else {
                            onPresetChange(e.target.value); onValueChange(e.target.value);
                        }
                    }}
                    className="block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-black dark:text-white focus:ring-2 focus:ring-[#007D8C]"
                >
                    <option value="">Select reserve…</option>
                    {RESERVE_PRESETS.map(r => <option key={r} value={r}>{r}</option>)}
                    <option value="__custom__">Other / Custom entry…</option>
                </select>
            ) : (
                <div className="flex gap-2">
                    <input
                        value={value}
                        onChange={e => onValueChange(e.target.value)}
                        placeholder="Enter reserve name and number"
                        className="block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-black dark:text-white focus:ring-2 focus:ring-[#007D8C]"
                    />
                    <button
                        type="button"
                        onClick={() => { onPresetChange(''); onValueChange(''); }}
                        className="shrink-0 text-xs px-3 border border-[#007D8C] text-[#007D8C] rounded hover:bg-teal-50 dark:hover:bg-teal-900/20 transition whitespace-nowrap"
                    >
                        Use preset
                    </button>
                </div>
            )}
        </div>
    );
};

// ─── Type helpers ──────────────────────────────────────────────────

type SectionHandler<T> = (field: keyof T, value: any) => void;
type ArrayToggler<T> = (field: keyof T, item: string) => void;

// ─── Cover Section ─────────────────────────────────────────────────

interface CoverProps {
    cover: IogcCoverData;
    topLevel: Pick<IogcLeaseAuditData, 'projectNumber' | 'surfaceLeaseOS' | 'proponent' | 'projectName' | 'location' | 'date' | 'reportWrittenBy' | 'professionalSignOff' | 'followUpDate' | 'reportDate'>;
    derivedComplianceStatus?: string; // auto-synced from sectionE.q46OverallCompliance
    onChange: SectionHandler<IogcCoverData>;
    onTopChange: (field: string, value: string) => void;
    onToggleArray: ArrayToggler<IogcCoverData>;
    errors: Set<string>;
    highlights?: Record<string, TextHighlight[]>;
    inlineComments?: Record<string, TextComment[]>;
    onHighlightsChange?: (field: string, h: TextHighlight[]) => void;
    onInlineCommentsChange?: (field: string, c: TextComment[]) => void;
    onAnchorPositionsChange?: (fieldId: string, a: CommentAnchorPosition[]) => void;
    hoveredCommentId?: string | null;
    sectionKey?: string;
}

export const IogcCoverSection: React.FC<CoverProps> = ({ cover, topLevel, derivedComplianceStatus, onChange, onTopChange, onToggleArray, errors, highlights, inlineComments, onHighlightsChange, onInlineCommentsChange, onAnchorPositionsChange, hoveredCommentId, sectionKey = 'cover' }) => {
    const compDisplay = derivedComplianceStatus || cover.complianceStatus;
    const compLabel = compDisplay
        ? isInCompliance(compDisplay) ? 'In compliance' : 'Not in compliance'
        : null;

    return (
        <Section title="IOGC Surface Lease Environmental Audit">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <EditableField label="IOGC File Number" value={cover.iogcFileNumber} onChange={v => onChange('iogcFileNumber', v)} isInvalid={errors.has('cover.iogcFileNumber')} />
                    <EditableField label="Legal Location" value={cover.legalLocation} onChange={v => onChange('legalLocation', v)} isInvalid={errors.has('cover.legalLocation')} />
                    <EditableField label="Province" value={cover.province} onChange={v => onChange('province', v)} />
                    <ReserveSelector
                        value={cover.reserveNameNumber}
                        preset={cover.reserveNamePreset || ''}
                        onValueChange={v => onChange('reserveNameNumber', v)}
                        onPresetChange={v => onChange('reserveNamePreset', v)}
                    />
                    <EditableField label="Lessee Name" value={cover.lesseeName} onChange={v => onChange('lesseeName', v)} isInvalid={errors.has('cover.lesseeName')} />
                    <EditableField label="Well Spud Date" value={cover.wellSpudDate} onChange={v => onChange('wellSpudDate', v)} />
                </div>
                <div className="space-y-4">
                    <EditableField label="X-Terra Project Number" value={topLevel.projectNumber} onChange={v => onTopChange('projectNumber', v)} isInvalid={errors.has('projectNumber')} />
                    <EditableField label="Surface Lease / OS Number" value={topLevel.surfaceLeaseOS} onChange={v => onTopChange('surfaceLeaseOS', v)} />
                    <EditableField label="Proponent / Client" value={topLevel.proponent} onChange={v => onTopChange('proponent', v)} />
                    <EditableField label="Project Name" value={topLevel.projectName} onChange={v => onTopChange('projectName', v)} />
                    <EditableField label="Location" value={topLevel.location} onChange={v => onTopChange('location', v)} />
                    <EditableField label="Audit Date" value={cover.auditDate} onChange={v => onChange('auditDate', v)} isInvalid={errors.has('cover.auditDate')} placeholder="Month Day, Year" />
                </div>
            </div>

            <RadioGroup label="Site Status" options={SITE_STATUS_OPTIONS} value={cover.siteStatus} onChange={v => onChange('siteStatus', v)} />
            <MultiCheckbox label="Type of Site (select all that apply)" options={SITE_TYPE_OPTIONS} selected={cover.siteTypes} onToggle={item => onToggleArray('siteTypes', item)} />
            <MultiCheckbox label="Commodity / Facility Flags" options={COMMODITY_OPTIONS} selected={cover.gasFlags} onToggle={item => onToggleArray('gasFlags', item)} />
            <RadioGroup label="Audit Type" options={AUDIT_TYPE_OPTIONS} value={cover.auditType} onChange={v => onChange('auditType', v)} isInvalid={errors.has('cover.auditType')} />

            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-3">Report Addresses</h3>
                <div className="space-y-1">
                    <RadioGroup label="Facilities" options={['Included', 'Not Included']} value={cover.reportAddressesFacilities} onChange={v => onChange('reportAddressesFacilities', v)} />
                    <RadioGroup label="Vegetation" options={['Included', 'Not Included']} value={cover.reportAddressesVegetation} onChange={v => onChange('reportAddressesVegetation', v)} />
                    <RadioGroup label="Housekeeping" options={['Included', 'Not Included']} value={cover.reportAddressesHousekeeping} onChange={v => onChange('reportAddressesHousekeeping', v)} />
                    <RadioGroup label="Protection" options={['Included', 'Not Included']} value={cover.reportAddressesProtection} onChange={v => onChange('reportAddressesProtection', v)} />
                    <RadioGroup label="Summary" options={['Included', 'Not Included']} value={cover.reportAddressesSummary} onChange={v => onChange('reportAddressesSummary', v)} />
                    <RadioGroup label="Terms Review" options={['Included', 'Not Included']} value={cover.reportAddressesTermsReview} onChange={v => onChange('reportAddressesTermsReview', v)} />
                </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-3">Attachments</h3>
                <div className="space-y-1">
                    <RadioGroup label="Terms/Conditions Letter" options={['Included', 'Not Included']} value={cover.attachTermsLetter} onChange={v => onChange('attachTermsLetter', v)} />
                    <RadioGroup label="Site Sketch" options={['Included', 'Not Included']} value={cover.attachSiteSketch} onChange={v => onChange('attachSiteSketch', v)} />
                    <RadioGroup label="Site Photos" options={['Included', 'Not Included']} value={cover.attachSitePhotos} onChange={v => onChange('attachSitePhotos', v)} />
                    <RadioGroup label="Follow-Up Report" options={['Included', 'Not Included']} value={cover.attachFollowUp} onChange={v => onChange('attachFollowUp', v)} />
                </div>
            </div>

            <RadioGroup label="Copy Sent to First Nation" options={['Yes', 'No']} value={cover.copySentToFirstNation} onChange={v => onChange('copySentToFirstNation', v)} />

            {/* Compliance status — read-only, auto-derived from Item 46 */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                <span className="font-medium text-gray-800 dark:text-gray-200">Compliance Status</span>
                <div className="flex items-center gap-3 mt-2 sm:mt-0">
                    <span className={`text-sm font-semibold px-3 py-1 rounded-full ${compLabel === 'In compliance' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : compLabel ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'}`}>
                        {compLabel ?? 'Not yet set'}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 italic">Auto-derived from Item 46</span>
                </div>
            </div>

            <RadioGroup label="Summary of Non-Compliance Issues" options={['Included', 'N/A']} value={cover.nonComplianceSummaryIncluded} onChange={v => onChange('nonComplianceSummaryIncluded', v)} />
            <RadioGroup label="Recommendations Included" options={['Included', 'N/A']} value={cover.recommendationsIncluded} onChange={v => onChange('recommendationsIncluded', v)} />
            <RadioGroup label="Compliance Description Included" options={['Included', 'N/A']} value={cover.complianceDescriptionIncluded} onChange={v => onChange('complianceDescriptionIncluded', v)} />

            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-3">Professional Declaration</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <EditableField label="Name" value={cover.declarationName} onChange={v => onChange('declarationName', v)} />
                    <EditableField label="Designation" value={cover.declarationDesignation} onChange={v => onChange('declarationDesignation', v)} />
                    <EditableField label="Date" value={cover.declarationDate} onChange={v => onChange('declarationDate', v)} />
                </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-3">Report Info</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <EditableField label="Report Written By" value={topLevel.reportWrittenBy} onChange={v => onTopChange('reportWrittenBy', v)} />
                    <EditableField label="Professional Sign-Off" value={topLevel.professionalSignOff} onChange={v => onTopChange('professionalSignOff', v)} />
                    <EditableField label="Report Date" value={topLevel.reportDate} onChange={v => onTopChange('reportDate', v)} />
                    <EditableField label="Follow-Up Date" value={topLevel.followUpDate} onChange={v => onTopChange('followUpDate', v)} />
                </div>
            </div>
        </Section>
    );
};

// ─── Section A: First Year Requirements (Q1–Q11) ──────────────────

interface SectionAProps {
    data: IogcSectionA;
    onChange: SectionHandler<IogcSectionA>;
    onToggleArray: ArrayToggler<IogcSectionA>;
    highlights?: Record<string, TextHighlight[]>;
    inlineComments?: Record<string, TextComment[]>;
    onHighlightsChange?: (field: string, h: TextHighlight[]) => void;
    onInlineCommentsChange?: (field: string, c: TextComment[]) => void;
    onAnchorPositionsChange?: (fieldId: string, a: CommentAnchorPosition[]) => void;
    hoveredCommentId?: string | null;
    sectionKey?: string;
}

export const IogcSectionAPanel: React.FC<SectionAProps> = ({ data, onChange, onToggleArray, highlights, inlineComments, onHighlightsChange, onInlineCommentsChange, onAnchorPositionsChange, hoveredCommentId, sectionKey = 'a' }) => (
    <Section title="Section A: First Year Environmental Audit Requirements">
        <p className="text-sm text-blue-600 dark:text-blue-400 italic mb-2">
            This section applies to 1st Year audits only. It is hidden for subsequent audit types.
        </p>

        <QuestionBlock num="Q1" label="Was an environmental monitor required and utilized during construction?">
            <SelectField label="Environmental Monitor Required" options={YES_NO_NA} value={data.q1EnvMonitorRequired} onChange={v => onChange('q1EnvMonitorRequired', v)} />
            <EditableField label="Monitor Name" value={data.q1MonitorName} onChange={v => onChange('q1MonitorName', v)} />
            <EditableField label="Monitor Company" value={data.q1MonitorCompany} onChange={v => onChange('q1MonitorCompany', v)} />
            <EditableField label="Start of Construction Date" value={data.q1StartConstructionDate} onChange={v => onChange('q1StartConstructionDate', v)} />
            <RadioGroup label="Construction Method" options={['Single lift', 'Two-lift', 'Minimal Disturbance', 'Other']} value={data.q1ConstructionMethod} onChange={v => onChange('q1ConstructionMethod', v)} />
            {data.q1ConstructionMethod === 'Other' && (
                <EditableField label="Other Method (specify)" value={data.q1ConstructionMethodOther} onChange={v => onChange('q1ConstructionMethodOther', v)} />
            )}
            <SelectField label="Soil Handling Practices" options={['Satisfactory', 'Unsatisfactory']} value={data.q1SoilHandling} onChange={v => onChange('q1SoilHandling', v)} />
            {data.q1SoilHandling === 'Unsatisfactory' && (
                <BulletPointEditor label="Explain" fieldId={`${sectionKey}.q1SoilHandlingExplain`} value={data.q1SoilHandlingExplain} highlights={highlights?.['q1SoilHandlingExplain']} inlineComments={inlineComments?.['q1SoilHandlingExplain']} onChange={v => onChange('q1SoilHandlingExplain', v)} onHighlightsChange={h => onHighlightsChange?.('q1SoilHandlingExplain', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q1SoilHandlingExplain', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q1SoilHandlingExplain`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
            )}
            <EditableField label="Spud Date" value={data.q1SpudDate} onChange={v => onChange('q1SpudDate', v)} />
            <BulletPointEditor label="Setbacks and Timing Restrictions" fieldId={`${sectionKey}.q1Setbacks`} value={data.q1Setbacks} highlights={highlights?.['q1Setbacks']} inlineComments={inlineComments?.['q1Setbacks']} onChange={v => onChange('q1Setbacks', v)} onHighlightsChange={h => onHighlightsChange?.('q1Setbacks', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q1Setbacks', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q1Setbacks`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
            <EditableField label="Federal Department Notification / Authorization" value={data.q1FederalDept} onChange={v => onChange('q1FederalDept', v)} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q1Comments`} value={data.q1Comments} highlights={highlights?.['q1Comments']} inlineComments={inlineComments?.['q1Comments']} onChange={v => onChange('q1Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q1Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q1Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q1Comments`, a)} hoveredCommentId={hoveredCommentId} rows={3} />
        </QuestionBlock>

        <QuestionBlock num="Q2" label="Was there a First Nation liaison present during construction?">
            <SelectField label="FN Liaison Present" options={YES_NO_NA} value={data.q2FnLiaison} onChange={v => onChange('q2FnLiaison', v)} />
            <EditableField label="Liaison Name" value={data.q2LiaisonName} onChange={v => onChange('q2LiaisonName', v)} />
            <BulletPointEditor label="Cultural / Heritage Sites Identified" fieldId={`${sectionKey}.q2CulturalSites`} value={data.q2CulturalSites} highlights={highlights?.['q2CulturalSites']} inlineComments={inlineComments?.['q2CulturalSites']} onChange={v => onChange('q2CulturalSites', v)} onHighlightsChange={h => onHighlightsChange?.('q2CulturalSites', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q2CulturalSites', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q2CulturalSites`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q2Comments`} value={data.q2Comments} highlights={highlights?.['q2Comments']} inlineComments={inlineComments?.['q2Comments']} onChange={v => onChange('q2Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q2Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q2Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q2Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q3" label="Was a wildlife/vegetation survey completed?">
            <SelectField label="Wildlife/Vegetation Survey" options={YES_NO_NA} value={data.q3WildlifeSurvey} onChange={v => onChange('q3WildlifeSurvey', v)} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q3Comments`} value={data.q3Comments} highlights={highlights?.['q3Comments']} inlineComments={inlineComments?.['q3Comments']} onChange={v => onChange('q3Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q3Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q3Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q3Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q4" label="Were any additional mitigation measures required?">
            <SelectField label="Additional Mitigation Required" options={YES_NO_NA} value={data.q4AdditionalMitigation} onChange={v => onChange('q4AdditionalMitigation', v)} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q4Comments`} value={data.q4Comments} highlights={highlights?.['q4Comments']} inlineComments={inlineComments?.['q4Comments']} onChange={v => onChange('q4Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q4Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q4Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q4Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q5" label="Were any fences altered or removed?">
            <SelectField label="Fence Alterations" options={YES_NO_NA} value={data.q5FenceAlterations} onChange={v => onChange('q5FenceAlterations', v)} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q5Comments`} value={data.q5Comments} highlights={highlights?.['q5Comments']} inlineComments={inlineComments?.['q5Comments']} onChange={v => onChange('q5Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q5Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q5Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q5Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q6" label="Was water well testing conducted?">
            <SelectField label="Water Well Testing" options={YES_NO_NA} value={data.q6WaterWellTesting} onChange={v => onChange('q6WaterWellTesting', v)} />
            <SelectField label="Results Included" options={YES_NO_NA} value={data.q6ResultsIncluded} onChange={v => onChange('q6ResultsIncluded', v)} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q6Comments`} value={data.q6Comments} highlights={highlights?.['q6Comments']} inlineComments={inlineComments?.['q6Comments']} onChange={v => onChange('q6Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q6Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q6Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q6Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q7" label="Drilling waste disposal">
            <SelectField label="Waste Location" options={['On-site', 'Off-site']} value={data.q7WasteLocation} onChange={v => onChange('q7WasteLocation', v)} />
            <SelectField label="Reserve Location" options={['On-Reserve', 'Off-Reserve']} value={data.q7ReserveLocation} onChange={v => onChange('q7ReserveLocation', v)} />
            <SelectField label="Compliance with Provincial Regulations" options={YES_NO_NA} value={data.q7ComplianceWithRegs} onChange={v => onChange('q7ComplianceWithRegs', v)} />
            <EditableField label="Mud Type" value={data.q7MudType} onChange={v => onChange('q7MudType', v)} />
            <EditableField label="Sump Type" value={data.q7SumpType} onChange={v => onChange('q7SumpType', v)} />
            <MultiCheckbox label="Disposal Methods" options={['Earth Pit', 'Sump', 'Remote Earth Pit', 'Landspray-While Drilling', 'Landspreading', 'Mix-Bury-Cover', 'Remote Sump', 'Other']} selected={data.q7DisposalMethods} onToggle={item => onToggleArray('q7DisposalMethods', item)} />
            <EditableField label="Remote Sump OS #" value={data.q7RemoteSumpOS} onChange={v => onChange('q7RemoteSumpOS', v)} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q7Comments`} value={data.q7Comments} highlights={highlights?.['q7Comments']} inlineComments={inlineComments?.['q7Comments']} onChange={v => onChange('q7Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q7Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q7Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q7Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q8" label="Was landspraying conducted on reserve?">
            <SelectField label="Landspray on Reserve" options={YES_NO_NA} value={data.q8LandsprayOnReserve} onChange={v => onChange('q8LandsprayOnReserve', v)} />
            <SelectField label="Report Attached" options={YES_NO_NA} value={data.q8ReportAttached} onChange={v => onChange('q8ReportAttached', v)} />
            <SelectField label="Meets Criteria" options={YES_NO_NA} value={data.q8MeetsCriteria} onChange={v => onChange('q8MeetsCriteria', v)} />
        </QuestionBlock>

        <QuestionBlock num="Q9" label="Timber management and salvage">
            <MultiCheckbox label="Timber Methods" options={['Rollback', 'Burning', 'Distribution of salvage', 'Salvage or cut', 'Rolled back of leaning/scarred trees', 'Mulched', 'Other']} selected={data.q9TimberMethods} onToggle={item => onToggleArray('q9TimberMethods', item)} />
            <SelectField label="Notification of First Nation" options={YES_NO_NA} value={data.q9FnNotification} onChange={v => onChange('q9FnNotification', v)} />
        </QuestionBlock>

        <QuestionBlock num="Q10" label="Progressive reclamation / interim clean-up">
            <SelectField label="Progressive Reclamation" options={YES_NO_NA} value={data.q10ProgressiveReclamation} onChange={v => onChange('q10ProgressiveReclamation', v)} />
            <SelectField label="Slopes Contoured to Surrounding Area" options={YES_NO_NA} value={data.q10SlopesContoured} onChange={v => onChange('q10SlopesContoured', v)} />
            <SelectField label="Soils Re-spread over Non-Use Portion of Lease" options={YES_NO_NA} value={data.q10SoilsRespread} onChange={v => onChange('q10SoilsRespread', v)} />
            <EditableField label="Method of Vegetation Establishment" value={data.q10VegetationMethod} onChange={v => onChange('q10VegetationMethod', v)} />
            <SelectField label="Certified Seed Analysis Obtained" options={YES_NO_NA} value={data.q10CertifiedSeed} onChange={v => onChange('q10CertifiedSeed', v)} />
            <RadioGroup label="Vegetation Establishment" options={QUALITY_SCALE} value={data.q10VegetationEstablishment} onChange={v => onChange('q10VegetationEstablishment', v)} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q10Comments`} value={data.q10Comments} highlights={highlights?.['q10Comments']} inlineComments={inlineComments?.['q10Comments']} onChange={v => onChange('q10Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q10Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q10Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q10Comments`, a)} hoveredCommentId={hoveredCommentId} rows={3} />
        </QuestionBlock>

        <QuestionBlock num="Q11" label="Construction-related equipment, materials and waste removed; site generally cleaned up">
            <SelectField label="Construction Cleanup Complete" options={YES_NO_NA} value={data.q11ConstructionCleanup} onChange={v => onChange('q11ConstructionCleanup', v)} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q11Comments`} value={data.q11Comments} highlights={highlights?.['q11Comments']} inlineComments={inlineComments?.['q11Comments']} onChange={v => onChange('q11Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q11Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q11Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q11Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>
    </Section>
);

// ─── Section B: Vegetation Monitoring (Q12–Q14) ───────────────────

interface SectionBProps {
    data: IogcSectionB;
    onChange: SectionHandler<IogcSectionB>;
    onToggleArray: ArrayToggler<IogcSectionB>;
    highlights?: Record<string, TextHighlight[]>;
    inlineComments?: Record<string, TextComment[]>;
    onHighlightsChange?: (field: string, h: TextHighlight[]) => void;
    onInlineCommentsChange?: (field: string, c: TextComment[]) => void;
    onAnchorPositionsChange?: (fieldId: string, a: CommentAnchorPosition[]) => void;
    hoveredCommentId?: string | null;
    sectionKey?: string;
}

export const IogcSectionBPanel: React.FC<SectionBProps> = ({ data, onChange, onToggleArray, highlights, inlineComments, onHighlightsChange, onInlineCommentsChange, onAnchorPositionsChange, hoveredCommentId, sectionKey = 'b' }) => (
    <Section title="Section B: Vegetation Monitoring and Management">
        <QuestionBlock num="Q12" label="Weed species identified on site">
            <BulletPointEditor label="Weed List" fieldId={`${sectionKey}.q12WeedList`} value={data.q12WeedList} highlights={highlights?.['q12WeedList']} inlineComments={inlineComments?.['q12WeedList']} onChange={v => onChange('q12WeedList', v)} onHighlightsChange={h => onHighlightsChange?.('q12WeedList', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q12WeedList', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q12WeedList`, a)} hoveredCommentId={hoveredCommentId} rows={3} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q12Comments`} value={data.q12Comments} highlights={highlights?.['q12Comments']} inlineComments={inlineComments?.['q12Comments']} onChange={v => onChange('q12Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q12Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q12Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q12Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q13" label="What is the general status of vegetation?">
            <RadioGroup label="Vegetation Status" options={QUALITY_SCALE} value={data.q13VegetationStatus} onChange={v => onChange('q13VegetationStatus', v)} />
            <SelectField label="Stressed Vegetation On-Site or Off-Site" options={YES_NO_NA} value={data.q13StressedVegetation} onChange={v => onChange('q13StressedVegetation', v)} />
            <SelectField label="Bare Spots On-Site or Off-Site" options={YES_NO_NA} value={data.q13BareSpots} onChange={v => onChange('q13BareSpots', v)} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q13Comments`} value={data.q13Comments} highlights={highlights?.['q13Comments']} inlineComments={inlineComments?.['q13Comments']} onChange={v => onChange('q13Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q13Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q13Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q13Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q14" label="Weed monitoring and control plan">
            <SelectField label="Weed Monitoring Plan in Place" options={YES_NO_NA} value={data.q14WeedMonitoringPlan} onChange={v => onChange('q14WeedMonitoringPlan', v)} />
            <MultiCheckbox label="Weed Control Strategies (select all that apply)" options={WEED_CONTROL_STRATEGIES} selected={data.q14WeedControlOptions || []} onToggle={item => onToggleArray('q14WeedControlOptions', item)} />
            {(data.q14WeedControlOptions || []).includes('Other') && (
                <BulletPointEditor label="Other – explain" fieldId={`${sectionKey}.q14WeedControlStrategies`} value={data.q14WeedControlStrategies} highlights={highlights?.['q14WeedControlStrategies']} inlineComments={inlineComments?.['q14WeedControlStrategies']} onChange={v => onChange('q14WeedControlStrategies', v)} onHighlightsChange={h => onHighlightsChange?.('q14WeedControlStrategies', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q14WeedControlStrategies', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q14WeedControlStrategies`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
            )}
            <SelectField label="Ongoing Inspections for Weed Species" options={YES_NO_NA} value={data.q14OngoingInspections} onChange={v => onChange('q14OngoingInspections', v)} />
            <SelectField label="Compliant with Provincial Regulations" options={YES_NO_NA} value={data.q14CompliantWithRegs} onChange={v => onChange('q14CompliantWithRegs', v)} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q14Comments`} value={data.q14Comments} highlights={highlights?.['q14Comments']} inlineComments={inlineComments?.['q14Comments']} onChange={v => onChange('q14Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q14Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q14Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q14Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>
    </Section>
);

// ─── Section C: General Housekeeping (Q15–Q29) ────────────────────

interface SectionCProps {
    data: IogcSectionC;
    onChange: SectionHandler<IogcSectionC>;
    highlights?: Record<string, TextHighlight[]>;
    inlineComments?: Record<string, TextComment[]>;
    onHighlightsChange?: (field: string, h: TextHighlight[]) => void;
    onInlineCommentsChange?: (field: string, c: TextComment[]) => void;
    onAnchorPositionsChange?: (fieldId: string, a: CommentAnchorPosition[]) => void;
    hoveredCommentId?: string | null;
    sectionKey?: string;
}

export const IogcSectionCPanel: React.FC<SectionCProps> = ({ data, onChange, highlights, inlineComments, onHighlightsChange, onInlineCommentsChange, onAnchorPositionsChange, hoveredCommentId, sectionKey = 'c' }) => (
    <Section title="Section C: General Housekeeping and Maintenance">
        <QuestionBlock num="Q15" label="Is the well/facility active, suspended, or abandoned?">
            <SelectField label="Activity Status" options={SITE_STATUS_OPTIONS} value={data.q15Activity} onChange={v => onChange('q15Activity', v)} note="Auto-populated from cover sheet site status" />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q15Comments`} value={data.q15Comments} highlights={highlights?.['q15Comments']} inlineComments={inlineComments?.['q15Comments']} onChange={v => onChange('q15Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q15Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q15Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q15Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q16" label="Land use and access road conditions">
            <BulletPointEditor label="Land Use" fieldId={`${sectionKey}.q16Landuse`} value={data.q16Landuse} highlights={highlights?.['q16Landuse']} inlineComments={inlineComments?.['q16Landuse']} onChange={v => onChange('q16Landuse', v)} onHighlightsChange={h => onHighlightsChange?.('q16Landuse', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q16Landuse', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q16Landuse`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
            <BulletPointEditor label="Access Road Conditions" fieldId={`${sectionKey}.q16AccessRoadConditions`} value={data.q16AccessRoadConditions} highlights={highlights?.['q16AccessRoadConditions']} inlineComments={inlineComments?.['q16AccessRoadConditions']} onChange={v => onChange('q16AccessRoadConditions', v)} onHighlightsChange={h => onHighlightsChange?.('q16AccessRoadConditions', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q16AccessRoadConditions', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q16AccessRoadConditions`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q16Comments`} value={data.q16Comments} highlights={highlights?.['q16Comments']} inlineComments={inlineComments?.['q16Comments']} onChange={v => onChange('q16Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q16Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q16Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q16Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q17" label="Topography — low spots, slumping, and rutting">
            <SelectField label="Low Spots / Slumping" options={YES_NO_NA} value={data.q17LowSpotsSlumping} onChange={v => onChange('q17LowSpotsSlumping', v)} />
            <SelectField label="Rutting" options={YES_NO_NA} value={data.q17Rutting} onChange={v => onChange('q17Rutting', v)} />
            <EditableField label="Lease Accessibility" value={data.q17LeaseAccessibility} onChange={v => onChange('q17LeaseAccessibility', v)} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q17Comments`} value={data.q17Comments} highlights={highlights?.['q17Comments']} inlineComments={inlineComments?.['q17Comments']} onChange={v => onChange('q17Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q17Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q17Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q17Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q18" label="Traffic on lease access">
            <BulletPointEditor label="Traffic Description" fieldId={`${sectionKey}.q18Traffic`} value={data.q18Traffic} highlights={highlights?.['q18Traffic']} inlineComments={inlineComments?.['q18Traffic']} onChange={v => onChange('q18Traffic', v)} onHighlightsChange={h => onHighlightsChange?.('q18Traffic', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q18Traffic', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q18Traffic`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q18Comments`} value={data.q18Comments} highlights={highlights?.['q18Comments']} inlineComments={inlineComments?.['q18Comments']} onChange={v => onChange('q18Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q18Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q18Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q18Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q19" label="Lease berm condition">
            <RadioGroup label="Berm Condition" options={QUALITY_SCALE} value={data.q19LeaseBermCondition} onChange={v => onChange('q19LeaseBermCondition', v)} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q19Comments`} value={data.q19Comments} highlights={highlights?.['q19Comments']} inlineComments={inlineComments?.['q19Comments']} onChange={v => onChange('q19Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q19Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q19Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q19Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q20" label="Flare stack condition">
            <BulletPointEditor label="Flare Stack Description" fieldId={`${sectionKey}.q20FlareStack`} value={data.q20FlareStack} highlights={highlights?.['q20FlareStack']} inlineComments={inlineComments?.['q20FlareStack']} onChange={v => onChange('q20FlareStack', v)} onHighlightsChange={h => onHighlightsChange?.('q20FlareStack', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q20FlareStack', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q20FlareStack`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q20Comments`} value={data.q20Comments} highlights={highlights?.['q20Comments']} inlineComments={inlineComments?.['q20Comments']} onChange={v => onChange('q20Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q20Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q20Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q20Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q21" label="Odour detection">
            <SelectField label="Odour Detected" options={YES_NO_NA} value={data.q21OdourDetection} onChange={v => onChange('q21OdourDetection', v)} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q21Comments`} value={data.q21Comments} highlights={highlights?.['q21Comments']} inlineComments={inlineComments?.['q21Comments']} onChange={v => onChange('q21Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q21Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q21Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q21Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q22" label="Unused equipment, supplies, and felled trees removed">
            <SelectField label="Unused Equipment Removed" options={YES_NO_NA} value={data.q22UnusedEquipmentRemoved} onChange={v => onChange('q22UnusedEquipmentRemoved', v)} />
            <SelectField label="Felled Trees / Log Decks Removed" options={YES_NO_NA} value={data.q22FelledTreesRemoved} onChange={v => onChange('q22FelledTreesRemoved', v)} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q22Comments`} value={data.q22Comments} highlights={highlights?.['q22Comments']} inlineComments={inlineComments?.['q22Comments']} onChange={v => onChange('q22Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q22Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q22Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q22Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q23" label="Garbage and debris disposal and/or control">
            <RadioGroup label="Garbage / Debris Condition" options={QUALITY_SCALE} value={data.q23GarbageDebris} onChange={v => onChange('q23GarbageDebris', v)} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q23Comments`} value={data.q23Comments} highlights={highlights?.['q23Comments']} inlineComments={inlineComments?.['q23Comments']} onChange={v => onChange('q23Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q23Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q23Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q23Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q24" label="Reported complaints">
            <SelectField label="Complaints Reported" options={YES_NO_NA} value={data.q24ReportedComplaints} onChange={v => onChange('q24ReportedComplaints', v)} />
            {data.q24ReportedComplaints === 'Yes' && (
                <BulletPointEditor label="Investigated and Follow-Up Actions" fieldId={`${sectionKey}.q24Investigated`} value={data.q24Investigated} highlights={highlights?.['q24Investigated']} inlineComments={inlineComments?.['q24Investigated']} onChange={v => onChange('q24Investigated', v)} onHighlightsChange={h => onHighlightsChange?.('q24Investigated', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q24Investigated', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q24Investigated`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
            )}
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q24Comments`} value={data.q24Comments} highlights={highlights?.['q24Comments']} inlineComments={inlineComments?.['q24Comments']} onChange={v => onChange('q24Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q24Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q24Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q24Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q25" label="Drainage">
            <RadioGroup label="Drainage Condition" options={QUALITY_SCALE} value={data.q25Drainage} onChange={v => onChange('q25Drainage', v)} />
            <SelectField label="Ponding On-Site" options={YES_NO_NA} value={data.q25Ponding} onChange={v => onChange('q25Ponding', v)} />
            <SelectField label="Aquatic Vegetation Present On-Site" options={YES_NO_NA} value={data.q25AquaticVegetation} onChange={v => onChange('q25AquaticVegetation', v)} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q25Comments`} value={data.q25Comments} highlights={highlights?.['q25Comments']} inlineComments={inlineComments?.['q25Comments']} onChange={v => onChange('q25Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q25Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q25Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q25Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q26" label="Pump-off of excess water">
            <BulletPointEditor label="Pump-Off Description" fieldId={`${sectionKey}.q26PumpOff`} value={data.q26PumpOff} highlights={highlights?.['q26PumpOff']} inlineComments={inlineComments?.['q26PumpOff']} onChange={v => onChange('q26PumpOff', v)} onHighlightsChange={h => onHighlightsChange?.('q26PumpOff', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q26PumpOff', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q26PumpOff`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
            <EditableField label="Frequency" value={data.q26Frequency} onChange={v => onChange('q26Frequency', v)} />
            <SelectField label="Erosion Present" options={YES_NO_NA} value={data.q26Erosion} onChange={v => onChange('q26Erosion', v)} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q26Comments`} value={data.q26Comments} highlights={highlights?.['q26Comments']} inlineComments={inlineComments?.['q26Comments']} onChange={v => onChange('q26Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q26Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q26Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q26Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q27" label="Erosion control measures">
            <SelectField
                label="Effectiveness of Erosion Control"
                options={EROSION_EFFECTIVENESS}
                value={data.q27ErosionControl}
                onChange={v => onChange('q27ErosionControl', v)}
                note="Select the effectiveness rating that best describes the erosion control measures on site."
            />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q27Comments`} value={data.q27Comments} highlights={highlights?.['q27Comments']} inlineComments={inlineComments?.['q27Comments']} onChange={v => onChange('q27Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q27Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q27Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q27Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q28" label="Waterbodies in proximity">
            <SelectField label="Waterbodies Present" options={YES_NO_NA} value={data.q28Waterbodies} onChange={v => onChange('q28Waterbodies', v)} />
            {data.q28Waterbodies === 'Yes' && (
                <>
                    <EditableField label="Distance from Boundary of Lease" value={data.q28Distance} onChange={v => onChange('q28Distance', v)} />
                    <EditableField label="Approximate Area" value={data.q28Area} onChange={v => onChange('q28Area', v)} />
                    <EditableField label="Buffer Present" value={data.q28Buffer} onChange={v => onChange('q28Buffer', v)} />
                    <BulletPointEditor label="Mitigation Measures" fieldId={`${sectionKey}.q28Mitigation`} value={data.q28Mitigation} highlights={highlights?.['q28Mitigation']} inlineComments={inlineComments?.['q28Mitigation']} onChange={v => onChange('q28Mitigation', v)} onHighlightsChange={h => onHighlightsChange?.('q28Mitigation', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q28Mitigation', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q28Mitigation`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
                </>
            )}
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q28Comments`} value={data.q28Comments} highlights={highlights?.['q28Comments']} inlineComments={inlineComments?.['q28Comments']} onChange={v => onChange('q28Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q28Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q28Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q28Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q29" label="Permits and authorization">
            <BulletPointEditor label="Permits / Authorization Description" fieldId={`${sectionKey}.q29PermitsAuthorization`} value={data.q29PermitsAuthorization} highlights={highlights?.['q29PermitsAuthorization']} inlineComments={inlineComments?.['q29PermitsAuthorization']} onChange={v => onChange('q29PermitsAuthorization', v)} onHighlightsChange={h => onHighlightsChange?.('q29PermitsAuthorization', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q29PermitsAuthorization', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q29PermitsAuthorization`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
            <SelectField label="Any Ongoing Permits or Authorizations Required" options={YES_NO_NA} value={data.q29OngoingPermits} onChange={v => onChange('q29OngoingPermits', v)} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q29Comments`} value={data.q29Comments} highlights={highlights?.['q29Comments']} inlineComments={inlineComments?.['q29Comments']} onChange={v => onChange('q29Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q29Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q29Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q29Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>
    </Section>
);

// ─── Section D: Environmental Protection (Q30–Q41) ────────────────

interface SectionDProps {
    data: IogcSectionD;
    onChange: SectionHandler<IogcSectionD>;
    highlights?: Record<string, TextHighlight[]>;
    inlineComments?: Record<string, TextComment[]>;
    onHighlightsChange?: (field: string, h: TextHighlight[]) => void;
    onInlineCommentsChange?: (field: string, c: TextComment[]) => void;
    onAnchorPositionsChange?: (fieldId: string, a: CommentAnchorPosition[]) => void;
    hoveredCommentId?: string | null;
    sectionKey?: string;
}

export const IogcSectionDPanel: React.FC<SectionDProps> = ({ data, onChange, highlights, inlineComments, onHighlightsChange, onInlineCommentsChange, onAnchorPositionsChange, hoveredCommentId, sectionKey = 'd' }) => (
    <Section title="Section D: Environmental Protection and Safety">
        <QuestionBlock num="Q30" label="Signage">
            <RadioGroup label="Signage Compliance" options={COMPLIANCE_SCALE} value={data.q30Signage} onChange={v => onChange('q30Signage', v)} />
            <SelectField label="Visible" options={YES_NO_NA} value={data.q30Visible} onChange={v => onChange('q30Visible', v)} />
            <SelectField label="Legible" options={YES_NO_NA} value={data.q30Legible} onChange={v => onChange('q30Legible', v)} />
            <SelectField label="1-800 / 24-Hour # Posted" options={YES_NO_NA} value={data.q30Hotline} onChange={v => onChange('q30Hotline', v)} />
            {data.q30Signage === 'Not in compliance – explain below' && (
                <BulletPointEditor label="Explain non-compliance" fieldId={`${sectionKey}.q30Comments`} value={data.q30Comments} highlights={highlights?.['q30Comments']} inlineComments={inlineComments?.['q30Comments']} onChange={v => onChange('q30Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q30Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q30Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q30Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
            )}
            {data.q30Signage !== 'Not in compliance – explain below' && (
                <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q30Comments`} value={data.q30Comments} highlights={highlights?.['q30Comments']} inlineComments={inlineComments?.['q30Comments']} onChange={v => onChange('q30Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q30Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q30Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q30Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
            )}
        </QuestionBlock>

        <QuestionBlock num="Q31" label="Fencing">
            <SelectField label="Fencing Present" options={YES_NO_NA} value={data.q31Fencing} onChange={v => onChange('q31Fencing', v)} />
            <EditableField label="Human Restriction" value={data.q31HumanRestriction} onChange={v => onChange('q31HumanRestriction', v)} />
            <EditableField label="Livestock Restriction" value={data.q31LivestockRestriction} onChange={v => onChange('q31LivestockRestriction', v)} />
            <SelectField label="Properly Maintained" options={YES_NO_NA} value={data.q31Maintained} onChange={v => onChange('q31Maintained', v)} />
            <EditableField label="Condition of Texas Gate" value={data.q31TexasGateCondition} onChange={v => onChange('q31TexasGateCondition', v)} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q31Comments`} value={data.q31Comments} highlights={highlights?.['q31Comments']} inlineComments={inlineComments?.['q31Comments']} onChange={v => onChange('q31Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q31Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q31Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q31Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q32" label="Culverts">
            <SelectField label="Culverts Present" options={YES_NO_NA} value={data.q32Culverts} onChange={v => onChange('q32Culverts', v)} />
            <SelectField label="Properly Installed" options={YES_NO_NA} value={data.q32ProperlyInstalled} onChange={v => onChange('q32ProperlyInstalled', v)} />
            <SelectField label="Correct Size" options={YES_NO_NA} value={data.q32CorrectSize} onChange={v => onChange('q32CorrectSize', v)} />
            <SelectField label="Properly Maintained / Functioning" options={YES_NO_NA} value={data.q32ProperlyMaintained} onChange={v => onChange('q32ProperlyMaintained', v)} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q32Comments`} value={data.q32Comments} highlights={highlights?.['q32Comments']} inlineComments={inlineComments?.['q32Comments']} onChange={v => onChange('q32Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q32Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q32Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q32Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q33" label="Surface casing vent">
            <SelectField label="Surface Casing Vent Present" options={YES_NO_NA} value={data.q33SurfaceCasingVent} onChange={v => onChange('q33SurfaceCasingVent', v)} />
            <SelectField label="Open / Closed" options={['Open', 'Closed', 'NA']} value={data.q33OpenClosed} onChange={v => onChange('q33OpenClosed', v)} />
            <SelectField label="Proper Above-Ground Clearance" options={YES_NO_NA} value={data.q33Clearance} onChange={v => onChange('q33Clearance', v)} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q33Comments`} value={data.q33Comments} highlights={highlights?.['q33Comments']} inlineComments={inlineComments?.['q33Comments']} onChange={v => onChange('q33Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q33Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q33Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q33Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q34" label="Wellhead valves">
            <BulletPointEditor label="Wellhead Valves Description" fieldId={`${sectionKey}.q34WellheadValves`} value={data.q34WellheadValves} highlights={highlights?.['q34WellheadValves']} inlineComments={inlineComments?.['q34WellheadValves']} onChange={v => onChange('q34WellheadValves', v)} onHighlightsChange={h => onHighlightsChange?.('q34WellheadValves', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q34WellheadValves', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q34WellheadValves`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
            <SelectField label="Bull-Plugs Present on Outlets" options={YES_NO_NA} value={data.q34BullPlugs} onChange={v => onChange('q34BullPlugs', v)} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q34Comments`} value={data.q34Comments} highlights={highlights?.['q34Comments']} inlineComments={inlineComments?.['q34Comments']} onChange={v => onChange('q34Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q34Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q34Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q34Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q35" label="Chemical storage">
            <SelectField label="Chemical Storage Present" options={YES_NO_NA} value={data.q35ChemicalStorage} onChange={v => onChange('q35ChemicalStorage', v)} />
            <SelectField label="All Drums / Tanks Properly Sealed" options={YES_NO_NA} value={data.q35Sealed} onChange={v => onChange('q35Sealed', v)} />
            <SelectField label="WHMIS Labels Legible" options={YES_NO_NA} value={data.q35Whmis} onChange={v => onChange('q35Whmis', v)} />
            <SelectField label="Stored According to MSDS" options={YES_NO_NA} value={data.q35Msds} onChange={v => onChange('q35Msds', v)} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q35Comments`} value={data.q35Comments} highlights={highlights?.['q35Comments']} inlineComments={inlineComments?.['q35Comments']} onChange={v => onChange('q35Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q35Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q35Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q35Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q36" label="Tanks / secondary containment">
            <SelectField label="Tanks Present" options={YES_NO_NA} value={data.q36Tanks} onChange={v => onChange('q36Tanks', v)} />
            <SelectField label="Tanks / Containment in Good Repair" options={YES_NO_NA} value={data.q36InGoodRepair} onChange={v => onChange('q36InGoodRepair', v)} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q36Comments`} value={data.q36Comments} highlights={highlights?.['q36Comments']} inlineComments={inlineComments?.['q36Comments']} onChange={v => onChange('q36Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q36Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q36Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q36Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q37" label="Reportable spills">
            <SelectField label="Reportable Spills Occurred" options={YES_NO_NA} value={data.q37ReportableSpills} onChange={v => onChange('q37ReportableSpills', v)} />
            {data.q37ReportableSpills === 'Yes' && (
                <>
                    <EditableField label="Spill Date" value={data.q37SpillDate} onChange={v => onChange('q37SpillDate', v)} />
                    <EditableField label="Substance Released" value={data.q37Substance} onChange={v => onChange('q37Substance', v)} />
                    <EditableField label="Volume Released" value={data.q37Volume} onChange={v => onChange('q37Volume', v)} />
                    <EditableField label="First Nations and IOGC Notified" value={data.q37Notified} onChange={v => onChange('q37Notified', v)} />
                </>
            )}
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q37Comments`} value={data.q37Comments} highlights={highlights?.['q37Comments']} inlineComments={inlineComments?.['q37Comments']} onChange={v => onChange('q37Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q37Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q37Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q37Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q38" label="Surface staining">
            <SelectField label="Surface Staining Present" options={YES_NO_NA} value={data.q38SurfaceStaining} onChange={v => onChange('q38SurfaceStaining', v)} />
            <SelectField label="On-Site" options={YES_NO_NA} value={data.q38OnSite} onChange={v => onChange('q38OnSite', v)} />
            <SelectField label="Off-Site" options={YES_NO_NA} value={data.q38OffSite} onChange={v => onChange('q38OffSite', v)} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q38Comments`} value={data.q38Comments} highlights={highlights?.['q38Comments']} inlineComments={inlineComments?.['q38Comments']} onChange={v => onChange('q38Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q38Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q38Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q38Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q39" label="Emergency Response Plan (ERP)">
            <RadioGroup label="ERP Compliance" options={COMPLIANCE_SCALE} value={data.q39Erp} onChange={v => onChange('q39Erp', v)} />
            <SelectField label="ERP in Place" options={YES_NO_NA} value={data.q39ErpInPlace} onChange={v => onChange('q39ErpInPlace', v)} />
            {data.q39Erp === 'Not in compliance – explain below' && (
                <BulletPointEditor label="Explain non-compliance" fieldId={`${sectionKey}.q39Comments`} value={data.q39Comments} highlights={highlights?.['q39Comments']} inlineComments={inlineComments?.['q39Comments']} onChange={v => onChange('q39Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q39Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q39Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q39Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
            )}
            {data.q39Erp !== 'Not in compliance – explain below' && (
                <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q39Comments`} value={data.q39Comments} highlights={highlights?.['q39Comments']} inlineComments={inlineComments?.['q39Comments']} onChange={v => onChange('q39Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q39Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q39Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q39Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
            )}
        </QuestionBlock>

        <QuestionBlock num="Q40" label="ERP exercise last conducted (for H2S sites)">
            <BulletPointEditor label="ERP Exercise Description" fieldId={`${sectionKey}.q40ErpExercise`} value={data.q40ErpExercise} highlights={highlights?.['q40ErpExercise']} inlineComments={inlineComments?.['q40ErpExercise']} onChange={v => onChange('q40ErpExercise', v)} onHighlightsChange={h => onHighlightsChange?.('q40ErpExercise', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q40ErpExercise', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q40ErpExercise`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
            <EditableField label="Date" value={data.q40Date} onChange={v => onChange('q40Date', v)} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q40Comments`} value={data.q40Comments} highlights={highlights?.['q40Comments']} inlineComments={inlineComments?.['q40Comments']} onChange={v => onChange('q40Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q40Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q40Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q40Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q41" label="Excavation hazards">
            <SelectField label="Excavation Hazards Present" options={YES_NO_NA} value={data.q41ExcavationHazards} onChange={v => onChange('q41ExcavationHazards', v)} />
            <BulletPointEditor label="Comments" fieldId={`${sectionKey}.q41Comments`} value={data.q41Comments} highlights={highlights?.['q41Comments']} inlineComments={inlineComments?.['q41Comments']} onChange={v => onChange('q41Comments', v)} onHighlightsChange={h => onHighlightsChange?.('q41Comments', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q41Comments', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q41Comments`, a)} hoveredCommentId={hoveredCommentId} rows={2} />
        </QuestionBlock>
    </Section>
);

// ─── Section E: Summary (Q42–Q46) ─────────────────────────────────

interface SectionEProps {
    data: IogcSectionE;
    onChange: SectionHandler<IogcSectionE>;
    errors: Set<string>;
    highlights?: Record<string, TextHighlight[]>;
    inlineComments?: Record<string, TextComment[]>;
    onHighlightsChange?: (field: string, h: TextHighlight[]) => void;
    onInlineCommentsChange?: (field: string, c: TextComment[]) => void;
    onAnchorPositionsChange?: (fieldId: string, a: CommentAnchorPosition[]) => void;
    hoveredCommentId?: string | null;
    sectionKey?: string;
}

export const IogcSectionEPanel: React.FC<SectionEProps> = ({ data, onChange, errors, highlights, inlineComments, onHighlightsChange, onInlineCommentsChange, onAnchorPositionsChange, hoveredCommentId, sectionKey = 'e' }) => (
    <Section title="Section E: Overall Summary and Compliance">
        <p className="text-sm text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded">
            Item 46 drives the cover page compliance status and summary. Complete this section last.
        </p>

        <QuestionBlock num="Q42" label="Are IOGC terms and conditions being met?">
            <RadioGroup label="IOGC Terms Compliance" options={COMPLIANCE_SCALE} value={data.q42IogcTerms} onChange={v => onChange('q42IogcTerms', v)} />
            <BulletPointEditor
                label="Comments"
                fieldId={`${sectionKey}.q42Comments`}
                value={data.q42Comments}
                highlights={highlights?.['q42Comments']}
                inlineComments={inlineComments?.['q42Comments']}
                onChange={v => onChange('q42Comments', v)}
                onHighlightsChange={h => onHighlightsChange?.('q42Comments', h)}
                onInlineCommentsChange={c => onInlineCommentsChange?.('q42Comments', c)}
                onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q42Comments`, a)}
                hoveredCommentId={hoveredCommentId}
                rows={3}
            />
        </QuestionBlock>

        <QuestionBlock num="Q43" label="Are other applicable regulations being met?">
            <RadioGroup label="Other Regulations Compliance" options={COMPLIANCE_SCALE} value={data.q43OtherRegulations} onChange={v => onChange('q43OtherRegulations', v)} />
            <BulletPointEditor
                label="Comments"
                fieldId={`${sectionKey}.q43Comments`}
                value={data.q43Comments}
                highlights={highlights?.['q43Comments']}
                inlineComments={inlineComments?.['q43Comments']}
                onChange={v => onChange('q43Comments', v)}
                onHighlightsChange={h => onHighlightsChange?.('q43Comments', h)}
                onInlineCommentsChange={c => onInlineCommentsChange?.('q43Comments', c)}
                onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q43Comments`, a)}
                hoveredCommentId={hoveredCommentId}
                rows={3}
            />
        </QuestionBlock>

        <QuestionBlock num="Q44" label="Summary of lease non-compliance items">
            <BulletPointEditor label="Non-Compliance Summary" fieldId={`${sectionKey}.q44SummaryNonCompliance`} value={data.q44SummaryNonCompliance} highlights={highlights?.['q44SummaryNonCompliance']} inlineComments={inlineComments?.['q44SummaryNonCompliance']} onChange={v => onChange('q44SummaryNonCompliance', v)} onHighlightsChange={h => onHighlightsChange?.('q44SummaryNonCompliance', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q44SummaryNonCompliance', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q44SummaryNonCompliance`, a)} hoveredCommentId={hoveredCommentId} rows={4} />
        </QuestionBlock>

        <QuestionBlock num="Q45" label="Non-compliance follow-up actions">
            <BulletPointEditor label="Follow-Up Actions Required" fieldId={`${sectionKey}.q45NonComplianceFollowUp`} value={data.q45NonComplianceFollowUp} highlights={highlights?.['q45NonComplianceFollowUp']} inlineComments={inlineComments?.['q45NonComplianceFollowUp']} onChange={v => onChange('q45NonComplianceFollowUp', v)} onHighlightsChange={h => onHighlightsChange?.('q45NonComplianceFollowUp', h)} onInlineCommentsChange={c => onInlineCommentsChange?.('q45NonComplianceFollowUp', c)} onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q45NonComplianceFollowUp`, a)} hoveredCommentId={hoveredCommentId} rows={4} />
        </QuestionBlock>

        <QuestionBlock num="Q46" label="Overall lease compliance — drives cover page" noteColor="amber">
            <RadioGroup
                label="Overall Compliance"
                options={COMPLIANCE_SCALE}
                value={data.q46OverallCompliance}
                onChange={v => onChange('q46OverallCompliance', v)}
                isInvalid={errors.has('sectionE.q46OverallCompliance')}
            />
            <BulletPointEditor
                label="Summary Comments"
                fieldId={`${sectionKey}.q46Comments`}
                value={data.q46Comments}
                highlights={highlights?.['q46Comments']}
                inlineComments={inlineComments?.['q46Comments']}
                onChange={v => onChange('q46Comments', v)}
                onHighlightsChange={h => onHighlightsChange?.('q46Comments', h)}
                onInlineCommentsChange={c => onInlineCommentsChange?.('q46Comments', c)}
                onAnchorPositionsChange={a => onAnchorPositionsChange?.(`${sectionKey}.q46Comments`, a)}
                hoveredCommentId={hoveredCommentId}
                rows={4}
            />
        </QuestionBlock>
    </Section>
);

// ─── Section F: Attachments ────────────────────────────────────────

const ATTACHMENT_DEFS: { key: keyof IogcSectionF; label: string }[] = [
    { key: 'termsLetter',   label: 'Copy of IOGC Environmental Protection Terms Letter' },
    { key: 'siteSketch',    label: 'Site Sketch and Survey' },
    { key: 'sitePhotos',    label: 'Site Photos' },
    { key: 'followUpReport', label: 'Follow-Up Compliance Reporting – Photo Log' },
];

interface SectionFProps {
    data: IogcSectionF;
    onChange: (key: keyof IogcSectionF, changes: Partial<IogcAttachment>) => void;
}

export const IogcSectionFPanel: React.FC<SectionFProps> = ({ data, onChange }) => {
    const fileInputRefs = useRef<Partial<Record<keyof IogcSectionF, HTMLInputElement | null>>>({});

    const handleFileSelect = (key: keyof IogcSectionF, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            const result = evt.target?.result as string;
            const base64 = result.includes(',') ? result.split(',')[1] : result;
            onChange(key, { fileName: file.name, fileData: base64 });
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    return (
        <Section title="Section F: Attachments">
            <p className="text-sm text-gray-500 dark:text-gray-400">
                Check each attachment to include it in the report. Upload a PDF to embed it after the main report pages.
            </p>
            <div className="space-y-3 mt-2">
                {ATTACHMENT_DEFS.map(({ key, label }) => {
                    const att = data[key];
                    return (
                        <div key={key} className="flex flex-wrap items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                            <input
                                type="checkbox"
                                id={`att-${key}`}
                                checked={att.included}
                                onChange={e => onChange(key, { included: e.target.checked })}
                                className="h-4 w-4 rounded border-gray-300 text-[#007D8C] focus:ring-[#007D8C] flex-shrink-0"
                            />
                            <label htmlFor={`att-${key}`} className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer min-w-[200px]">
                                {label}
                            </label>
                            {att.included && (
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    {att.fileName ? (
                                        <>
                                            <span className="text-xs text-gray-500 dark:text-gray-400 max-w-[180px] truncate" title={att.fileName}>
                                                {att.fileName}
                                            </span>
                                            <button
                                                onClick={() => onChange(key, { fileName: undefined, fileData: undefined })}
                                                className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition"
                                                title="Remove file"
                                            >
                                                ✕
                                            </button>
                                        </>
                                    ) : (
                                        <span className="text-xs text-amber-600 dark:text-amber-400 italic">No PDF attached</span>
                                    )}
                                    <button
                                        onClick={() => fileInputRefs.current[key]?.click()}
                                        className="text-xs px-2 py-1 bg-[#007D8C] hover:bg-[#006070] text-white rounded transition"
                                    >
                                        {att.fileName ? 'Replace' : 'Attach PDF'}
                                    </button>
                                    <input
                                        ref={el => { fileInputRefs.current[key] = el; }}
                                        type="file"
                                        accept=".pdf,application/pdf"
                                        className="hidden"
                                        onChange={e => handleFileSelect(key, e)}
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </Section>
    );
};
