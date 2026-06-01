import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CloseIcon } from './icons';

// ─── Data model ─────────────────────────────────────────────────────────────

interface ScheduleEntry {
    id: string;
    project: string;
    location: string;
    extra: string;       // other useful columns joined
    color: string;       // from Excel cell background
    textColor: string;   // black or white for contrast
}

interface DayEntry {
    notes: string;
    tasks: { id: string; text: string; done: boolean }[];
    schedule: ScheduleEntry[];
}

type PlannerData = Record<string, DayEntry>; // "YYYY-MM-DD" → entry

const STORAGE_KEY   = 'xtec_planner_data';
const MY_NAME_KEY   = 'xtec_planner_my_name';

const empty = (): DayEntry => ({ notes: '', tasks: [], schedule: [] });

const load = (): PlannerData => {
    try {
        const r = localStorage.getItem(STORAGE_KEY);
        if (!r) return {};
        const raw = JSON.parse(r) as Record<string, any>;
        // Migrate entries from older format that lacked schedule array
        const out: PlannerData = {};
        for (const [k, v] of Object.entries(raw)) {
            out[k] = { notes: v?.notes ?? '', tasks: v?.tasks ?? [], schedule: v?.schedule ?? [] };
        }
        return out;
    } catch { return {}; }
};
const persist = (d: PlannerData) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {}
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const toKey = (y: number, m: number, d: number) =>
    `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
const DOW    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

/** Parse many date string formats → "YYYY-MM-DD" or null */
const parseDate = (raw: string): string | null => {
    const s = (raw ?? '').toString().trim();
    if (!s) return null;
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return `${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`;
    const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`;
    const dmy = s.match(/^(\d{1,2})[.\-](\d{1,2})[.\-](\d{2,4})/);
    if (dmy) {
        const yr = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
        return `${yr}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    return null;
};

/** Parse Excel serial number → "YYYY-MM-DD" */
const excelSerialToKey = (n: number): string | null => {
    if (!Number.isFinite(n) || n < 1) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
};

/** rgb(r,g,b) or #rrggbb → luminance → black/white text */
const textForBg = (color: string): string => {
    try {
        let r = 255, g = 255, b = 255;
        const rgb = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (rgb) { r = +rgb[1]; g = +rgb[2]; b = +rgb[3]; }
        else if (color.startsWith('#')) {
            const h = color.slice(1);
            r = parseInt(h.slice(0,2),16); g = parseInt(h.slice(2,4),16); b = parseInt(h.slice(4,6),16);
        }
        const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
        return lum > 0.55 ? '#1a1a1a' : '#ffffff';
    } catch { return '#1a1a1a'; }
};

/** Is this color too close to white/transparent to be useful? */
const isTrivialColor = (c: string): boolean => {
    if (!c || c === 'transparent' || c === 'rgba(0,0,0,0)' || c === 'rgba(0, 0, 0, 0)') return true;
    const m = c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (m) {
        const r = +m[1], g = +m[2], b = +m[3];
        return r > 245 && g > 245 && b > 245;
    }
    if (c === '#ffffff' || c === '#fff' || c === 'white') return true;
    return false;
};

// ─── Clipboard parsing ────────────────────────────────────────────────────────

interface ParsedCell { value: string; color: string; }
interface ParsedRow  { cells: ParsedCell[]; rowColor: string; }

const parseClipboard = (html: string, tsv: string): { headers: string[]; rows: ParsedRow[] } => {
    // Try HTML first (preserves colors)
    if (html) {
        try {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const trs = Array.from(doc.querySelectorAll('tr'));
            if (trs.length) {
                const allRows: ParsedRow[] = trs.map(tr => {
                    const cells: ParsedCell[] = Array.from(tr.querySelectorAll('td,th')).map(td => {
                        const el = td as HTMLElement;
                        const color = el.style.backgroundColor || '';
                        return { value: el.textContent?.trim() ?? '', color };
                    });
                    // Row's dominant color: first non-trivial bg color from any cell
                    const rowColor = cells.find(c => !isTrivialColor(c.color))?.color ?? '';
                    return { cells, rowColor };
                });
                if (allRows.length < 2) return fallback(tsv);
                const headers = allRows[0].cells.map(c => c.value);
                return { headers, rows: allRows.slice(1) };
            }
        } catch { /* fall through */ }
    }
    return fallback(tsv);
};

const fallback = (tsv: string): { headers: string[]; rows: ParsedRow[] } => {
    const lines = tsv.split('\n').filter(l => l.trim());
    if (!lines.length) return { headers: [], rows: [] };
    const headers = lines[0].split('\t').map(s => s.trim());
    const rows: ParsedRow[] = lines.slice(1).map(line => ({
        cells: line.split('\t').map(v => ({ value: v.trim(), color: '' })),
        rowColor: '',
    }));
    return { headers, rows };
};

/** Guess column indices */
const guessColumns = (headers: string[], rows: ParsedRow[]) => {
    const h = headers.map(s => s.toLowerCase());

    const dateIdx = h.findIndex(s => /\bdate\b|day\b|when\b/.test(s)) ??
        headers.findIndex((_, i) => rows.slice(0,5).some(r => parseDate(r.cells[i]?.value ?? '') !== null ||
            (Number.isFinite(+r.cells[i]?.value) && +r.cells[i].value > 40000)));

    const nameIdx = h.findIndex(s => /\bname\b|monitor\b|employee\b|staff\b|who\b|field\b|person\b/.test(s));

    const projectIdx = h.findIndex(s => /project|job|work order|file|number|#/.test(s) && !/date/.test(s));

    const locationIdx = h.findIndex(s => /location|site|place|where|area/.test(s));

    return {
        dateIdx:     dateIdx < 0 ? 0 : dateIdx,
        nameIdx:     nameIdx < 0 ? -1 : nameIdx,
        projectIdx:  projectIdx < 0 ? -1 : projectIdx,
        locationIdx: locationIdx < 0 ? -1 : locationIdx,
    };
};

// ─── Component ───────────────────────────────────────────────────────────────

interface CalendarPlannerProps { onClose: () => void; }

const CalendarPlanner: React.FC<CalendarPlannerProps> = ({ onClose }) => {
    const today = new Date();
    const [viewYear,    setViewYear]    = useState(today.getFullYear());
    const [viewMonth,   setViewMonth]   = useState(today.getMonth());
    const [selectedKey, setSelectedKey] = useState<string | null>(
        toKey(today.getFullYear(), today.getMonth(), today.getDate())
    );
    const [data,     setData]     = useState<PlannerData>(load);
    const [newTask,  setNewTask]  = useState('');
    const [myName,   setMyName]   = useState(() => localStorage.getItem(MY_NAME_KEY) ?? '');
    const [showPaste, setShowPaste] = useState(false);
    const [importMsg, setImportMsg] = useState<string | null>(null);

    // Paste dialog state
    const [pasteHtml, setPasteHtml] = useState('');
    const [pasteTsv,  setPasteTsv]  = useState('');
    const [parsed,    setParsed]    = useState<{ headers: string[]; rows: ParsedRow[] } | null>(null);
    const [colMap,    setColMap]    = useState<{ dateIdx: number; nameIdx: number; projectIdx: number; locationIdx: number } | null>(null);
    const pasteAreaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => { persist(data); }, [data]);
    useEffect(() => { localStorage.setItem(MY_NAME_KEY, myName); }, [myName]);

    // ── Navigation ──────────────────────────────────────────────────────────
    const prevMonth = () => { if (viewMonth===0){setViewMonth(11);setViewYear(v=>v-1);}else setViewMonth(m=>m-1); };
    const nextMonth = () => { if (viewMonth===11){setViewMonth(0);setViewYear(v=>v+1);}else setViewMonth(m=>m+1); };

    const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: (number | null)[] = [
        ...Array(firstDay).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    const entry = selectedKey ? (data[selectedKey] ?? empty()) : null;

    const isToday    = (d: number) => d===today.getDate() && viewMonth===today.getMonth() && viewYear===today.getFullYear();
    const isSelected = (d: number) => selectedKey === toKey(viewYear, viewMonth, d);
    const dayEntry   = (d: number) => data[toKey(viewYear, viewMonth, d)];

    // ── Paste handling ───────────────────────────────────────────────────────
    const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        e.preventDefault();
        const html = e.clipboardData.getData('text/html');
        const tsv  = e.clipboardData.getData('text/plain');
        setPasteHtml(html);
        setPasteTsv(tsv);
        const result = parseClipboard(html, tsv);
        setParsed(result);
        setColMap(guessColumns(result.headers, result.rows));
    }, []);

    const applyImport = () => {
        if (!parsed || !colMap) return;
        const name = myName.trim().toLowerCase();
        let count = 0;

        setData(prev => {
            const next = { ...prev };
            for (const row of parsed.rows) {
                // Filter by name if we have a name column and user name is set
                if (colMap.nameIdx >= 0 && name) {
                    const cell = (row.cells[colMap.nameIdx]?.value ?? '').toLowerCase();
                    if (!cell.includes(name)) continue;
                }

                // Resolve date
                const rawDate = row.cells[colMap.dateIdx]?.value ?? '';
                const numDate = Number(rawDate);
                const key = Number.isFinite(numDate) && numDate > 40000
                    ? excelSerialToKey(numDate)
                    : parseDate(rawDate);
                if (!key) continue;

                const project  = colMap.projectIdx  >= 0 ? (row.cells[colMap.projectIdx]?.value  ?? '') : '';
                const location = colMap.locationIdx >= 0 ? (row.cells[colMap.locationIdx]?.value ?? '') : '';

                // Extra = any other non-empty cell not already captured
                const usedIdx = new Set([colMap.dateIdx, colMap.nameIdx, colMap.projectIdx, colMap.locationIdx].filter(i=>i>=0));
                const extra = row.cells
                    .filter((_, i) => !usedIdx.has(i) && row.cells[i].value.trim())
                    .map(c => c.value.trim())
                    .join(' · ');

                const color = row.rowColor || '#007D8C';
                const entry: ScheduleEntry = {
                    id: `sched-${Date.now()}-${count}`,
                    project, location, extra, color,
                    textColor: textForBg(color),
                };

                const existing = next[key] ?? empty();
                // Avoid duplicate entries for the same project+date
                const isDuplicate = ( existing.schedule ?? [] ).some(s => s.project === project && s.location === location);
                if (!isDuplicate) {
                    next[key] = { ...existing, schedule: [...(existing.schedule ?? []), entry] };
                    count++;
                }
            }
            return next;
        });

        setImportMsg(`${count} schedule entr${count===1?'y':'ies'} added`);
        setShowPaste(false);
        setParsed(null);
        setPasteTsv('');
        setPasteHtml('');
    };

    // Navigate calendar to first scheduled month
    const jumpToFirstScheduled = () => {
        const keys = Object.keys(data).filter(k => data[k].schedule.length > 0).sort();
        if (keys.length) {
            setViewYear(parseInt(keys[0].slice(0,4)));
            setViewMonth(parseInt(keys[0].slice(5,7)) - 1);
        }
    };

    // ── Notes / tasks ────────────────────────────────────────────────────────
    const updateNotes = (notes: string) => {
        if (!selectedKey) return;
        setData(prev => ({ ...prev, [selectedKey]: { ...(prev[selectedKey] ?? empty()), notes } }));
    };

    const addTask = () => {
        if (!selectedKey || !newTask.trim()) return;
        const t = { id: Date.now().toString(), text: newTask.trim(), done: false };
        setData(prev => {
            const e = prev[selectedKey] ?? empty();
            return { ...prev, [selectedKey]: { ...e, tasks: [...e.tasks, t] } };
        });
        setNewTask('');
    };

    const toggleTask = (id: string) => {
        if (!selectedKey) return;
        setData(prev => {
            const e = prev[selectedKey];
            return { ...prev, [selectedKey]: { ...e, tasks: e.tasks.map(t => t.id===id ? {...t, done:!t.done} : t) } };
        });
    };

    const deleteTask = (id: string) => {
        if (!selectedKey) return;
        setData(prev => {
            const e = prev[selectedKey];
            return { ...prev, [selectedKey]: { ...e, tasks: e.tasks.filter(t => t.id!==id) } };
        });
    };

    const removeScheduleEntry = (entryId: string) => {
        if (!selectedKey) return;
        setData(prev => {
            const e = prev[selectedKey];
            return { ...prev, [selectedKey]: { ...e, schedule: e.schedule.filter(s => s.id !== entryId) } };
        });
    };

    const selectedDisplay = selectedKey
        ? new Date(parseInt(selectedKey.slice(0,4)), parseInt(selectedKey.slice(5,7))-1, parseInt(selectedKey.slice(8,10)))
              .toLocaleDateString('en-CA', { weekday:'long', month:'long', day:'numeric', year:'numeric' })
        : '';

    const matchedRowCount = parsed && colMap
        ? parsed.rows.filter(row => {
            if (colMap.nameIdx < 0 || !myName.trim()) return true;
            return (row.cells[colMap.nameIdx]?.value ?? '').toLowerCase().includes(myName.trim().toLowerCase());
          }).length
        : 0;

    return (
        <>
        {/* ── Main planner ─────────────────────────────────────────────── */}
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="xtec-modal-enter bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-2xl border border-gray-200 dark:border-[#007D8C]/20 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100 dark:border-white/5 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[#007D8C]/10 flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5 text-[#007D8C]" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                            </svg>
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-base font-semibold text-gray-800 dark:text-white">Field Planner</h2>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0">My name:</span>
                                <input
                                    value={myName}
                                    onChange={e => setMyName(e.target.value)}
                                    placeholder="e.g. Kole Schreiner"
                                    className="text-[11px] bg-transparent text-gray-600 dark:text-gray-300 outline-none border-b border-dashed border-gray-300 dark:border-white/20 focus:border-[#007D8C] w-32 pb-px"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {importMsg && (
                            <span className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-lg border border-green-200 dark:border-green-800">
                                ✓ {importMsg}
                            </span>
                        )}
                        <button
                            onClick={() => { setImportMsg(null); setShowPaste(true); setTimeout(() => pasteAreaRef.current?.focus(), 100); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#007D8C] border border-[#007D8C]/30 hover:bg-[#007D8C]/10 rounded-lg transition-colors"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75a2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
                            </svg>
                            Paste Schedule
                        </button>
                        <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                            <CloseIcon className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex flex-1 min-h-0 overflow-hidden">

                    {/* ── Calendar ── */}
                    <div className="w-72 shrink-0 flex flex-col border-r border-gray-100 dark:border-white/5">
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-white/5">
                            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 transition-colors">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                            </button>
                            <button onClick={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); }}
                                className="text-sm font-semibold text-gray-700 dark:text-gray-200 hover:text-[#007D8C] dark:hover:text-[#007D8C] transition-colors">
                                {MONTHS[viewMonth]} {viewYear}
                            </button>
                            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 transition-colors">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                            </button>
                        </div>

                        <div className="grid grid-cols-7 px-3 py-2">
                            {DOW.map(d => <div key={d} className="text-center text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">{d}</div>)}
                        </div>

                        <div className="grid grid-cols-7 px-2 pb-3 gap-y-0.5 flex-1">
                            {cells.map((day, i) => {
                                if (!day) return <div key={i} />;
                                const de = dayEntry(day);
                                const schedColors = de?.schedule.map(s => s.color).filter(Boolean) ?? [];
                                return (
                                    <div key={i} className="flex flex-col items-center gap-0.5">
                                        <button
                                            onClick={() => setSelectedKey(toKey(viewYear, viewMonth, day))}
                                            className={`relative w-8 h-8 text-sm rounded-lg flex items-center justify-center transition-colors font-medium
                                                ${isSelected(day)
                                                    ? 'bg-[#007D8C] text-white'
                                                    : isToday(day)
                                                        ? 'bg-[#007D8C]/15 text-[#007D8C] dark:text-[#00bcd4] font-bold'
                                                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10'
                                                }`}
                                        >
                                            {day}
                                            {/* Notes dot */}
                                            {!isSelected(day) && (de?.notes.trim() || de?.tasks.length) ? (
                                                <span className="absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500" />
                                            ) : null}
                                        </button>
                                        {/* Schedule color chips */}
                                        {schedColors.length > 0 && (
                                            <div className="flex gap-0.5 flex-wrap justify-center">
                                                {schedColors.slice(0,3).map((c, ci) => (
                                                    <span key={ci} className="w-4 h-1.5 rounded-full" style={{ backgroundColor: c }} />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Jump to scheduled */}
                        <button onClick={jumpToFirstScheduled}
                            className="mx-3 mb-3 text-[11px] text-[#007D8C] hover:underline text-center transition-colors">
                            Jump to first scheduled day →
                        </button>
                    </div>

                    {/* ── Day detail ── */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {selectedKey && entry ? (
                            <>
                                <div className="px-5 py-3 border-b border-gray-100 dark:border-white/5 shrink-0">
                                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{selectedDisplay}</p>
                                    {isToday(parseInt(selectedKey.slice(8,10))) &&
                                     parseInt(selectedKey.slice(5,7))-1===today.getMonth() &&
                                     parseInt(selectedKey.slice(0,4))===today.getFullYear() && (
                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#007D8C]">Today</span>
                                    )}
                                </div>

                                <div className="flex-1 overflow-y-auto p-5 space-y-5">

                                    {/* Schedule entries */}
                                    {( entry.schedule ?? [] ).length > 0 && (
                                        <div>
                                            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#007D8C] mb-2">Schedule</p>
                                            <div className="space-y-2">
                                                {(entry.schedule ?? []).map(s => (
                                                    <div key={s.id} className="group flex items-start gap-2 p-3 rounded-xl"
                                                        style={{ backgroundColor: s.color, color: s.textColor }}>
                                                        <div className="flex-1 min-w-0">
                                                            {s.project && <p className="text-sm font-semibold truncate">{s.project}</p>}
                                                            {s.location && <p className="text-xs opacity-80 truncate">{s.location}</p>}
                                                            {s.extra && <p className="text-xs opacity-70 mt-0.5 truncate">{s.extra}</p>}
                                                        </div>
                                                        <button onClick={() => removeScheduleEntry(s.id)}
                                                            className="opacity-0 group-hover:opacity-60 hover:opacity-100 shrink-0 p-0.5 transition-opacity"
                                                            style={{ color: s.textColor }}>
                                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Notes */}
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#007D8C] mb-2">Notes</p>
                                        <textarea value={entry.notes} onChange={e => updateNotes(e.target.value)}
                                            placeholder="Add notes for this day..." rows={3}
                                            className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition resize-none" />
                                    </div>

                                    {/* Tasks */}
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#007D8C] mb-2">Tasks</p>
                                        <div className="space-y-1.5 mb-3">
                                            {entry.tasks.length === 0 && <p className="text-xs text-gray-400 dark:text-gray-600 italic">No tasks</p>}
                                            {entry.tasks.map(t => (
                                                <div key={t.id} className="flex items-center gap-2 group">
                                                    <button onClick={() => toggleTask(t.id)}
                                                        className={`w-4 h-4 rounded shrink-0 border-2 flex items-center justify-center transition-colors ${t.done ? 'bg-[#007D8C] border-[#007D8C]' : 'border-gray-300 dark:border-white/20 hover:border-[#007D8C]'}`}>
                                                        {t.done && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                                                    </button>
                                                    <span className={`flex-1 text-sm ${t.done ? 'line-through text-gray-400 dark:text-gray-600' : 'text-gray-700 dark:text-gray-200'}`}>{t.text}</span>
                                                    <button onClick={() => deleteTask(t.id)} className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-500 transition-all">
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex gap-2">
                                            <input value={newTask} onChange={e => setNewTask(e.target.value)} onKeyDown={e => { if (e.key==='Enter') addTask(); }}
                                                placeholder="Add a task..." className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition" />
                                            <button onClick={addTask} className="px-3 py-1.5 bg-[#007D8C] hover:bg-[#006270] text-white text-sm font-semibold rounded-lg transition-colors">Add</button>
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex items-center justify-center">
                                <p className="text-sm text-gray-400 dark:text-gray-600">Select a day to view</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>

        {/* ── Paste dialog ─────────────────────────────────────────────────── */}
        {showPaste && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
                <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-2xl border border-gray-200 dark:border-[#007D8C]/20 w-full max-w-lg overflow-hidden">
                    <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-white/5">
                        <div>
                            <h3 className="text-base font-semibold text-gray-800 dark:text-white">Paste from Excel Schedule</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                Select all in Excel → Copy → paste below. Only <strong className="text-gray-700 dark:text-gray-200">{myName || 'your name'}</strong>'s rows will be imported.
                            </p>
                        </div>
                        <button onClick={() => { setShowPaste(false); setParsed(null); }} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                            <CloseIcon className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="px-6 py-5 space-y-4">
                        {!parsed ? (
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#007D8C] mb-2">Paste here</p>
                                <textarea
                                    ref={pasteAreaRef}
                                    onPaste={handlePaste}
                                    placeholder="Click here, then press Ctrl+V / Cmd+V to paste your Excel schedule..."
                                    rows={6}
                                    readOnly
                                    className="w-full text-sm px-3 py-2.5 rounded-xl border-2 border-dashed border-[#007D8C]/30 bg-[#007D8C]/5 dark:bg-[#007D8C]/10 text-gray-500 dark:text-gray-400 focus:border-[#007D8C] focus:outline-none cursor-pointer transition-colors resize-none text-center pt-10"
                                />
                                {!myName.trim() && (
                                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" /></svg>
                                        Set your name at the top of the planner so only your rows are imported.
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Column mapping */}
                                <div className="grid grid-cols-2 gap-3">
                                    {([
                                        { key: 'dateIdx',     label: 'Date column *' },
                                        { key: 'nameIdx',     label: 'Name / Monitor column' },
                                        { key: 'projectIdx',  label: 'Project column' },
                                        { key: 'locationIdx', label: 'Location column' },
                                    ] as const).map(({ key, label }) => (
                                        <div key={key}>
                                            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">{label}</label>
                                            <select
                                                value={colMap?.[key] ?? -1}
                                                onChange={e => setColMap(prev => prev ? { ...prev, [key]: +e.target.value } : null)}
                                                className="w-full text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-transparent text-gray-800 dark:text-white focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition"
                                            >
                                                <option value={-1}>— skip —</option>
                                                {parsed.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i+1}`}</option>)}
                                            </select>
                                        </div>
                                    ))}
                                </div>

                                {/* Match summary */}
                                <div className="xtec-report-card p-3">
                                    <p className="text-xs text-gray-600 dark:text-gray-400">
                                        <span className="font-semibold text-[#007D8C] text-sm">{matchedRowCount}</span> row{matchedRowCount !== 1 ? 's' : ''} matching <strong className="text-gray-800 dark:text-white">"{myName || 'any'}"</strong> found in {parsed.rows.length} total rows
                                    </p>
                                    {/* Color preview */}
                                    {parsed.rows.filter(r => colMap && colMap.nameIdx >= 0 && myName && r.cells[colMap.nameIdx]?.value.toLowerCase().includes(myName.toLowerCase()) && r.rowColor).slice(0,3).map((r, i) => (
                                        <div key={i} className="mt-2 flex items-center gap-2">
                                            <span className="w-4 h-4 rounded shrink-0" style={{ backgroundColor: r.rowColor || '#007D8C' }} />
                                            <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
                                                {colMap && colMap.dateIdx >= 0 ? r.cells[colMap.dateIdx]?.value : ''}{colMap && colMap.projectIdx >= 0 ? ' · ' + r.cells[colMap.projectIdx]?.value : ''}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                <button onClick={() => { setParsed(null); setPasteTsv(''); setPasteHtml(''); }}
                                    className="text-xs text-[#007D8C] hover:underline">
                                    ← Paste again
                                </button>
                            </div>
                        )}
                    </div>

                    {parsed && (
                        <div className="px-6 pb-5 flex gap-3">
                            <button onClick={() => { setShowPaste(false); setParsed(null); }}
                                className="flex-1 py-2 text-sm font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 text-gray-700 dark:text-white transition-colors">
                                Cancel
                            </button>
                            <button onClick={applyImport} disabled={!colMap || colMap.dateIdx < 0 || matchedRowCount === 0}
                                className="flex-1 py-2 text-sm font-semibold rounded-lg bg-[#007D8C] hover:bg-[#006270] disabled:opacity-40 text-white transition-colors">
                                Import {matchedRowCount} row{matchedRowCount !== 1 ? 's' : ''}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        )}
        </>
    );
};

export default CalendarPlanner;
