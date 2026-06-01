import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CloseIcon } from './icons';

// ─── Data model ──────────────────────────────────────────────────────────────

interface ScheduleEntry {
    id: string;
    label: string;      // most descriptive non-date cell
    details: string;    // other cells joined
    color: string;      // Excel bg color
    textColor: string;  // auto black/white
}

interface DayEntry {
    notes: string;
    tasks: { id: string; text: string; done: boolean }[];
    schedule: ScheduleEntry[];
}

type PlannerData = Record<string, DayEntry>;

const STORAGE_KEY = 'xtec_planner_data';
const MY_NAME_KEY = 'xtec_planner_my_name';

const empty = (): DayEntry => ({ notes: '', tasks: [], schedule: [] });

const load = (): PlannerData => {
    try {
        const r = localStorage.getItem(STORAGE_KEY);
        if (!r) return {};
        const raw = JSON.parse(r) as Record<string, any>;
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
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const parseDate = (s: string): string | null => {
    const v = (s ?? '').toString().trim();
    if (!v || v.length < 4) return null;
    const iso = v.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (iso) return `${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`;
    const mdy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`;
    const dmy = v.match(/^(\d{1,2})[.\-](\d{1,2})[.\-](\d{2,4})/);
    if (dmy) { const y = dmy[3].length===2?`20${dmy[3]}`:dmy[3]; return `${y}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`; }
    // Month name formats: "June 1, 2026" or "1 June 2026"
    const mon = v.match(/([A-Za-z]+)\s+(\d{1,2})[,\s]+(\d{4})/);
    if (mon) {
        const months: Record<string,string> = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
        const m = months[mon[1].slice(0,3).toLowerCase()];
        if (m) return `${mon[3]}-${m}-${mon[2].padStart(2,'0')}`;
    }
    const d = new Date(v);
    if (!isNaN(d.getTime()) && d.getFullYear() > 2000) {
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    return null;
};

const excelSerial = (n: number): string | null => {
    if (!Number.isFinite(n) || n < 40000 || n > 60000) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
};

const textForBg = (c: string): string => {
    try {
        let r=255,g=255,b=255;
        const m = c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (m) { r=+m[1];g=+m[2];b=+m[3]; }
        else if (c.startsWith('#') && c.length>=7) {
            r=parseInt(c.slice(1,3),16);g=parseInt(c.slice(3,5),16);b=parseInt(c.slice(5,7),16);
        }
        return (0.299*r+0.587*g+0.114*b)/255 > 0.55 ? '#1a1a1a' : '#ffffff';
    } catch { return '#1a1a1a'; }
};

const isTrivial = (c: string) => {
    if (!c||c==='transparent'||c.startsWith('rgba(0')) return true;
    const m = c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (m && +m[1]>240&&+m[2]>240&&+m[3]>240) return true;
    return c==='#ffffff'||c==='#fff'||c==='white';
};

// ─── Auto-import from clipboard ───────────────────────────────────────────────

interface ImportResult { count: number; firstKey: string | null; }

const autoImport = (
    html: string,
    tsv: string,
    myName: string,
    existing: PlannerData
): { next: PlannerData; result: ImportResult } => {

    // Parse rows from HTML (preserves colors) or TSV fallback
    interface Cell { value: string; color: string; }
    interface Row  { cells: Cell[]; rowColor: string; }

    let rows: Row[] = [];
    let startRow = 0; // skip header row if detected

    if (html) {
        try {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const trs = Array.from(doc.querySelectorAll('tr'));
            rows = trs.map(tr => {
                const cells: Cell[] = Array.from(tr.querySelectorAll('td,th')).map(td => {
                    const el = td as HTMLElement;
                    return { value: el.textContent?.trim() ?? '', color: el.style.backgroundColor || '' };
                });
                const rowColor = cells.find(c => !isTrivial(c.color))?.color ?? '';
                return { cells, rowColor };
            });
            // Skip header row (first row that has no parseable date and no name match)
            if (rows.length > 1) startRow = 1;
        } catch { /* fall through to TSV */ }
    }

    if (!rows.length && tsv) {
        const lines = tsv.split('\n').filter(l => l.trim());
        rows = lines.map(l => ({
            cells: l.split('\t').map(v => ({ value: v.trim(), color: '' })),
            rowColor: '',
        }));
        if (rows.length > 1) startRow = 1;
    }

    const name = myName.trim().toLowerCase();
    const next = { ...existing };
    let count = 0;
    let firstKey: string | null = null;

    for (let ri = startRow; ri < rows.length; ri++) {
        const row = rows[ri];
        const values = row.cells.map(c => c.value);

        // Filter by name — search every cell in the row
        if (name && !values.some(v => v.toLowerCase().includes(name))) continue;

        // Find the date cell
        let dateKey: string | null = null;
        let dateIdx = -1;
        for (let ci = 0; ci < values.length; ci++) {
            const v = values[ci];
            const num = Number(v);
            const k = excelSerial(num) ?? parseDate(v);
            if (k) { dateKey = k; dateIdx = ci; break; }
        }
        if (!dateKey) continue;

        // Build label from the most descriptive remaining cells (skip date, skip name cell, skip empty)
        const usedIdx = new Set([dateIdx]);
        // Find which cell contains the name so we can skip it
        if (name) {
            const ni = values.findIndex(v => v.toLowerCase().includes(name));
            if (ni >= 0) usedIdx.add(ni);
        }
        const rest = values
            .map((v, i) => ({ v: v.trim(), i }))
            .filter(({ v, i }) => v && !usedIdx.has(i));

        // Label = longest remaining cell (usually most descriptive like project name)
        const label = rest.reduce((a, b) => b.v.length > a.v.length ? b : a, { v: '', i: -1 }).v;
        const details = rest.filter(({ v }) => v !== label).map(({ v }) => v).join(' · ');

        const color = row.rowColor || '#007D8C';
        const entry: ScheduleEntry = {
            id: `s-${Date.now()}-${ri}`,
            label, details, color,
            textColor: textForBg(color),
        };

        const ex = next[dateKey] ?? empty();
        const dup = (ex.schedule ?? []).some(s => s.label === label);
        if (!dup) {
            next[dateKey] = { ...ex, schedule: [...(ex.schedule ?? []), entry] };
            if (!firstKey) firstKey = dateKey;
            count++;
        }
    }

    return { next, result: { count, firstKey } };
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
    const [data,       setData]       = useState<PlannerData>(load);
    const [newTask,    setNewTask]    = useState('');
    const [myName,     setMyName]     = useState(() => localStorage.getItem(MY_NAME_KEY) ?? '');
    const [showPaste,  setShowPaste]  = useState(false);
    const [importMsg,  setImportMsg]  = useState<string | null>(null);
    const pasteAreaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => { persist(data); }, [data]);
    useEffect(() => { localStorage.setItem(MY_NAME_KEY, myName); }, [myName]);

    const prevMonth = () => { if(viewMonth===0){setViewMonth(11);setViewYear(v=>v-1);}else setViewMonth(m=>m-1); };
    const nextMonth = () => { if(viewMonth===11){setViewMonth(0);setViewYear(v=>v+1);}else setViewMonth(m=>m+1); };

    const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: (number|null)[] = [
        ...Array(firstDay).fill(null),
        ...Array.from({length:daysInMonth},(_,i)=>i+1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    const entry      = selectedKey ? ({ ...empty(), ...(data[selectedKey] ?? {}) }) : null;
    const isToday    = (d:number) => d===today.getDate()&&viewMonth===today.getMonth()&&viewYear===today.getFullYear();
    const isSelected = (d:number) => selectedKey===toKey(viewYear,viewMonth,d);
    const dayEntry   = (d:number) => data[toKey(viewYear,viewMonth,d)];

    // ── Paste ──────────────────────────────────────────────────────────────────
    const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        e.preventDefault();
        const html = e.clipboardData.getData('text/html');
        const tsv  = e.clipboardData.getData('text/plain');

        const { next, result } = autoImport(html, tsv, myName, data);

        if (result.count === 0) {
            setImportMsg(myName.trim()
                ? `No rows found for "${myName}" — check your name matches the schedule exactly`
                : 'No dates found — make sure your name is set above');
        } else {
            setData(next);
            setImportMsg(`${result.count} day${result.count!==1?'s':''} imported for ${myName}`);
            if (result.firstKey) {
                setViewYear(parseInt(result.firstKey.slice(0,4)));
                setViewMonth(parseInt(result.firstKey.slice(5,7))-1);
            }
        }
        setShowPaste(false);
    }, [myName, data]);

    // ── Notes / tasks ──────────────────────────────────────────────────────────
    const updateNotes = (notes: string) => {
        if (!selectedKey) return;
        setData(prev => ({ ...prev, [selectedKey]: { ...empty(), ...(prev[selectedKey]??{}), notes } }));
    };

    const addTask = () => {
        if (!selectedKey || !newTask.trim()) return;
        const t = { id: Date.now().toString(), text: newTask.trim(), done: false };
        setData(prev => {
            const e = { ...empty(), ...(prev[selectedKey]??{}) };
            return { ...prev, [selectedKey]: { ...e, tasks: [...e.tasks, t] } };
        });
        setNewTask('');
    };

    const toggleTask = (id: string) => {
        if (!selectedKey) return;
        setData(prev => {
            const e = { ...empty(), ...(prev[selectedKey]??{}) };
            return { ...prev, [selectedKey]: { ...e, tasks: e.tasks.map(t=>t.id===id?{...t,done:!t.done}:t) } };
        });
    };

    const deleteTask = (id: string) => {
        if (!selectedKey) return;
        setData(prev => {
            const e = { ...empty(), ...(prev[selectedKey]??{}) };
            return { ...prev, [selectedKey]: { ...e, tasks: e.tasks.filter(t=>t.id!==id) } };
        });
    };

    const removeSchedule = (sid: string) => {
        if (!selectedKey) return;
        setData(prev => {
            const e = { ...empty(), ...(prev[selectedKey]??{}) };
            return { ...prev, [selectedKey]: { ...e, schedule: e.schedule.filter(s=>s.id!==sid) } };
        });
    };

    const jumpToFirst = () => {
        const keys = Object.keys(data).filter(k=>(data[k].schedule??[]).length>0).sort();
        if (keys.length) { setViewYear(parseInt(keys[0].slice(0,4))); setViewMonth(parseInt(keys[0].slice(5,7))-1); }
    };

    const selectedDisplay = selectedKey
        ? new Date(parseInt(selectedKey.slice(0,4)),parseInt(selectedKey.slice(5,7))-1,parseInt(selectedKey.slice(8,10)))
              .toLocaleDateString('en-CA',{weekday:'long',month:'long',day:'numeric',year:'numeric'})
        : '';

    return (
        <>
        {/* ── Main modal ──────────────────────────────────────────────────────── */}
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
                        <div>
                            <h2 className="text-base font-semibold text-gray-800 dark:text-white">Field Planner</h2>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[11px] text-gray-400 shrink-0">My name:</span>
                                <input value={myName} onChange={e=>setMyName(e.target.value)}
                                    placeholder="e.g. Kole Schreiner"
                                    className="text-[11px] bg-transparent text-gray-600 dark:text-gray-300 outline-none border-b border-dashed border-gray-300 dark:border-white/20 focus:border-[#007D8C] w-36 pb-px" />
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {importMsg && (
                            <span className={`text-xs font-medium px-2 py-1 rounded-lg border ${
                                importMsg.startsWith('No')
                                    ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                                    : 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                            }`}>
                                {importMsg.startsWith('No') ? '⚠ ' : '✓ '}{importMsg}
                            </span>
                        )}
                        <button onClick={() => { setImportMsg(null); setShowPaste(true); setTimeout(()=>pasteAreaRef.current?.focus(),80); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#007D8C] border border-[#007D8C]/30 hover:bg-[#007D8C]/10 rounded-lg transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
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

                    {/* Calendar */}
                    <div className="w-72 shrink-0 flex flex-col border-r border-gray-100 dark:border-white/5">
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-white/5">
                            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 transition-colors">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>
                            </button>
                            <button onClick={()=>{setViewYear(today.getFullYear());setViewMonth(today.getMonth());}}
                                className="text-sm font-semibold text-gray-700 dark:text-gray-200 hover:text-[#007D8C] transition-colors">
                                {MONTHS[viewMonth]} {viewYear}
                            </button>
                            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 transition-colors">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>
                            </button>
                        </div>

                        <div className="grid grid-cols-7 px-3 py-2">
                            {DOW.map(d=><div key={d} className="text-center text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">{d}</div>)}
                        </div>

                        <div className="grid grid-cols-7 px-2 pb-2 gap-y-0.5 flex-1">
                            {cells.map((day,i) => {
                                if (!day) return <div key={i}/>;
                                const de = dayEntry(day);
                                const colors = (de?.schedule??[]).map(s=>s.color).filter(Boolean);
                                return (
                                    <div key={i} className="flex flex-col items-center">
                                        <button onClick={()=>setSelectedKey(toKey(viewYear,viewMonth,day))}
                                            className={`w-8 h-8 text-sm rounded-lg flex items-center justify-center transition-colors font-medium
                                                ${isSelected(day) ? 'bg-[#007D8C] text-white'
                                                : isToday(day)    ? 'bg-[#007D8C]/15 text-[#007D8C] dark:text-[#00bcd4] font-bold'
                                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10'}`}>
                                            {day}
                                        </button>
                                        {colors.length > 0 && (
                                            <div className="flex gap-0.5 mt-0.5">
                                                {colors.slice(0,4).map((c,ci)=>(
                                                    <span key={ci} className="w-3.5 h-1 rounded-sm" style={{backgroundColor:c}}/>
                                                ))}
                                            </div>
                                        )}
                                        {!colors.length && (de?.notes?.trim()||de?.tasks?.length) && (
                                            <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500 mt-0.5"/>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <button onClick={jumpToFirst}
                            className="mx-3 mb-3 text-[11px] text-[#007D8C] hover:underline text-center">
                            Jump to first scheduled day →
                        </button>
                    </div>

                    {/* Day detail */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {selectedKey && entry ? (
                            <>
                                <div className="px-5 py-3 border-b border-gray-100 dark:border-white/5 shrink-0">
                                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{selectedDisplay}</p>
                                    {isToday(parseInt(selectedKey.slice(8,10)))&&parseInt(selectedKey.slice(5,7))-1===today.getMonth()&&parseInt(selectedKey.slice(0,4))===today.getFullYear()&&(
                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#007D8C]">Today</span>
                                    )}
                                </div>

                                <div className="flex-1 overflow-y-auto p-5 space-y-5">

                                    {/* Schedule entries */}
                                    {(entry.schedule??[]).length > 0 && (
                                        <div>
                                            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#007D8C] mb-2">Schedule</p>
                                            <div className="space-y-2">
                                                {(entry.schedule??[]).map(s=>(
                                                    <div key={s.id} className="group flex items-start gap-2 p-3 rounded-xl" style={{backgroundColor:s.color,color:s.textColor}}>
                                                        <div className="flex-1 min-w-0">
                                                            {s.label && <p className="text-sm font-semibold">{s.label}</p>}
                                                            {s.details && <p className="text-xs opacity-80 mt-0.5">{s.details}</p>}
                                                        </div>
                                                        <button onClick={()=>removeSchedule(s.id)}
                                                            className="opacity-0 group-hover:opacity-60 hover:!opacity-100 shrink-0 transition-opacity"
                                                            style={{color:s.textColor}}>
                                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Notes */}
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#007D8C] mb-2">Notes</p>
                                        <textarea value={entry.notes} onChange={e=>updateNotes(e.target.value)}
                                            placeholder="Add notes for this day..." rows={3}
                                            className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition resize-none"/>
                                    </div>

                                    {/* Tasks */}
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#007D8C] mb-2">Tasks</p>
                                        <div className="space-y-1.5 mb-3">
                                            {!(entry.tasks??[]).length && <p className="text-xs text-gray-400 dark:text-gray-600 italic">No tasks</p>}
                                            {(entry.tasks??[]).map(t=>(
                                                <div key={t.id} className="flex items-center gap-2 group">
                                                    <button onClick={()=>toggleTask(t.id)}
                                                        className={`w-4 h-4 rounded shrink-0 border-2 flex items-center justify-center transition-colors ${t.done?'bg-[#007D8C] border-[#007D8C]':'border-gray-300 dark:border-white/20 hover:border-[#007D8C]'}`}>
                                                        {t.done&&<svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>}
                                                    </button>
                                                    <span className={`flex-1 text-sm ${t.done?'line-through text-gray-400 dark:text-gray-600':'text-gray-700 dark:text-gray-200'}`}>{t.text}</span>
                                                    <button onClick={()=>deleteTask(t.id)} className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-500 transition-all">
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex gap-2">
                                            <input value={newTask} onChange={e=>setNewTask(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addTask();}}
                                                placeholder="Add a task..."
                                                className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition"/>
                                            <button onClick={addTask} className="px-3 py-1.5 bg-[#007D8C] hover:bg-[#006270] text-white text-sm font-semibold rounded-lg transition-colors">Add</button>
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex items-center justify-center">
                                <p className="text-sm text-gray-400 dark:text-gray-600">Select a day</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>

        {/* ── Paste dialog ──────────────────────────────────────────────────────── */}
        {showPaste && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
                <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-2xl border border-gray-200 dark:border-[#007D8C]/20 w-full max-w-md overflow-hidden">
                    <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-white/5">
                        <div>
                            <h3 className="text-base font-semibold text-gray-800 dark:text-white">Paste from Excel</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                In Excel: Select All → Copy. Then paste here.<br/>
                                Rows containing <strong className="text-gray-700 dark:text-gray-200">"{myName || 'your name'}"</strong> will be imported automatically.
                            </p>
                        </div>
                        <button onClick={()=>setShowPaste(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                            <CloseIcon className="h-4 w-4"/>
                        </button>
                    </div>
                    <div className="px-6 py-5">
                        {!myName.trim() && (
                            <div className="mb-4 flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
                                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z"/></svg>
                                Set your name in the planner first so only your rows are imported.
                            </div>
                        )}
                        <textarea
                            ref={pasteAreaRef}
                            onPaste={handlePaste}
                            placeholder="Click here, then press Ctrl+V / ⌘V"
                            rows={5}
                            readOnly
                            className="w-full text-sm px-4 py-8 rounded-xl border-2 border-dashed border-[#007D8C]/30 bg-[#007D8C]/5 dark:bg-[#007D8C]/10 text-gray-400 dark:text-gray-500 focus:border-[#007D8C] focus:outline-none transition-colors resize-none text-center cursor-pointer"
                        />
                        <p className="text-[11px] text-gray-400 dark:text-gray-600 text-center mt-2">
                            Colors from your Excel will be preserved on the calendar.
                        </p>
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

export default CalendarPlanner;
