import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CloseIcon } from './icons';

// ─── Palette ──────────────────────────────────────────────────────────────────
interface ColorEntry { id: string; label: string; color: string; }

const DEFAULT_PALETTE: ColorEntry[] = [
    { id: 'jeff-k',    label: 'Jeff K.',          color: '#FFFF00' },
    { id: 'lacey',     label: 'Lacey Teasdale',   color: '#55D4CF' },
    { id: 'tyson',     label: 'Tyson Doering',    color: '#2F6EBA' },
    { id: 'jostein',   label: 'Jostein Kevinsen', color: '#FF37CF' },
    { id: 'brian',     label: 'Brian',            color: '#FFC000' },
    { id: 'kirsten',   label: 'Kirsten',          color: '#92D050' },
    { id: 'off',       label: 'Off',              color: '#444444' },
];

const PALETTE_KEY = 'xtec_planner_palette';
const loadPalette = (): ColorEntry[] => {
    try { const r = localStorage.getItem(PALETTE_KEY); return r ? JSON.parse(r) : DEFAULT_PALETTE; }
    catch { return DEFAULT_PALETTE; }
};

// ─── Data model ───────────────────────────────────────────────────────────────
interface ScheduleEntry {
    id: string;
    projectNumber: string;
    projectName: string;
    location: string;
    startTime: string;
    endTime: string;
    allDay: boolean;
    colorId: string;
    color: string;
    textColor: string;
}
interface Task { id: string; text: string; done: boolean; }
interface DayEntry { notes: string; tasks: Task[]; schedule: ScheduleEntry[]; }
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
            out[k] = {
                notes: v?.notes ?? '',
                tasks: v?.tasks ?? [],
                schedule: (v?.schedule ?? []).map((s: any) => ({ startTime: '', endTime: '', allDay: false, location: '', ...s })),
            };
        }
        return out;
    } catch { return {}; }
};
const persist = (d: PlannerData) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {} };

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toKey = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const textForBg = (c: string): string => {
    try {
        let r=255,g=255,b=255;
        const m = c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (m) { r=+m[1]; g=+m[2]; b=+m[3]; }
        else if (c.startsWith('#') && c.length >= 7) { r=parseInt(c.slice(1,3),16); g=parseInt(c.slice(3,5),16); b=parseInt(c.slice(5,7),16); }
        return (0.299*r + 0.587*g + 0.114*b) / 255 > 0.5 ? '#1a1a1a' : '#ffffff';
    } catch { return '#1a1a1a'; }
};

const fmt12 = (t: string) => {
    if (!t) return '';
    const [hStr, mStr] = t.split(':');
    const h = parseInt(hStr, 10);
    return `${h % 12 === 0 ? 12 : h % 12}:${mStr} ${h >= 12 ? 'PM' : 'AM'}`;
};

const timeDisplay = (s: ScheduleEntry) => {
    if (s.allDay) return 'All Day';
    if (!s.startTime && !s.endTime) return '';
    if (s.startTime && s.endTime) return `${fmt12(s.startTime)} – ${fmt12(s.endTime)}`;
    return fmt12(s.startTime || s.endTime);
};

/** Duration in minutes, used for timeline height */
const durationMins = (s: ScheduleEntry): number => {
    if (!s.startTime || !s.endTime) return 60;
    const [sh, sm] = s.startTime.split(':').map(Number);
    const [eh, em] = s.endTime.split(':').map(Number);
    return Math.max(30, (eh * 60 + em) - (sh * 60 + sm));
};

/** Minutes from midnight */
const startMins = (s: ScheduleEntry): number => {
    if (!s.startTime) return 0;
    const [h, m] = s.startTime.split(':').map(Number);
    return h * 60 + m;
};

const isTrivial = (c: string) => {
    if (!c || c === 'transparent') return true;
    const m = c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (m && +m[1] > 240 && +m[2] > 240 && +m[3] > 240) return true;
    return c === '#ffffff' || c === '#fff';
};

const norm = (s: string) => (s ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

const parseDate = (s: string): string | null => {
    const v = norm(s); if (!v || v.length < 4) return null;
    const iso = v.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (iso) return `${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`;
    const mdy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`;
    const d = new Date(v);
    if (!isNaN(d.getTime()) && d.getFullYear() > 2000) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return null;
};

const excelSerial = (n: number): string | null => {
    if (!Number.isFinite(n) || n < 40000 || n > 60000) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
};

const datesBetween = (from: string, to: string, weekdayOnly?: number): string[] => {
    const out: string[] = [];
    const cur = new Date(from + 'T00:00:00');
    const end = new Date((to >= from ? to : from) + 'T00:00:00');
    while (cur <= end) {
        if (weekdayOnly === undefined || cur.getDay() === weekdayOnly) {
            out.push(cur.toISOString().slice(0, 10));
        }
        cur.setDate(cur.getDate() + 1);
    }
    return out;
};

const fmtDayHeading = (key: string) => {
    const d = new Date(key + 'T00:00:00');
    return d.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};

// ─── Component ────────────────────────────────────────────────────────────────
type PanelMode = 'day' | 'add';

interface CalendarPlannerProps { onClose: () => void; }

const CalendarPlanner: React.FC<CalendarPlannerProps> = ({ onClose }) => {
    const today = new Date();
    const todayKey = toKey(today.getFullYear(), today.getMonth(), today.getDate());

    const [viewYear,  setViewYear]  = useState(today.getFullYear());
    const [viewMonth, setViewMonth] = useState(today.getMonth());
    const [data,      setData]      = useState<PlannerData>(load);
    const [palette]                 = useState<ColorEntry[]>(loadPalette);
    const [myName,    setMyName]    = useState(() => localStorage.getItem(MY_NAME_KEY) ?? '');
    const [importMsg, setImportMsg] = useState<string|null>(null);
    const [showPaste, setShowPaste] = useState(false);

    const [selectedKey, setSelectedKey] = useState<string>(todayKey);
    const [panelMode,   setPanelMode]   = useState<PanelMode>('day');

    // Form state
    const [evtProject,   setEvtProject]   = useState('');
    const [evtName,      setEvtName]      = useState('');
    const [evtLocation,  setEvtLocation]  = useState('');
    const [evtFrom,      setEvtFrom]      = useState(todayKey);
    const [evtTo,        setEvtTo]        = useState(todayKey);
    const [evtStart,     setEvtStart]     = useState('');
    const [evtEnd,       setEvtEnd]       = useState('');
    const [evtAllDay,    setEvtAllDay]    = useState(false);
    const [evtRecurring, setEvtRecurring] = useState(false);
    const [evtColorId,   setEvtColorId]   = useState(palette[0]?.id ?? '');
    const [colorOpen,    setColorOpen]    = useState(false);
    const colorRef = useRef<HTMLDivElement>(null);

    const [newTask, setNewTask] = useState('');
    const pasteAreaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => { persist(data); }, [data]);
    useEffect(() => { localStorage.setItem(MY_NAME_KEY, myName); }, [myName]);

    useEffect(() => {
        if (!colorOpen) return;
        const fn = (e: MouseEvent) => { if (colorRef.current && !colorRef.current.contains(e.target as Node)) setColorOpen(false); };
        document.addEventListener('mousedown', fn);
        return () => document.removeEventListener('mousedown', fn);
    }, [colorOpen]);

    // Auto-fill "OFF" when Off color is selected
    useEffect(() => {
        const col = palette.find(p => p.id === evtColorId);
        if (col?.id === 'off') { setEvtName('OFF'); setEvtProject(''); setEvtAllDay(true); }
    }, [evtColorId, palette]);

    // ── Navigation ──────────────────────────────────────────────────────────
    const prevMonth = () => { if(viewMonth===0){setViewMonth(11);setViewYear(v=>v-1);}else setViewMonth(m=>m-1); };
    const nextMonth = () => { if(viewMonth===11){setViewMonth(0);setViewYear(v=>v+1);}else setViewMonth(m=>m+1); };

    const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: (number|null)[] = [...Array(firstDay).fill(null), ...Array.from({length:daysInMonth},(_,i)=>i+1)];
    while (cells.length % 7 !== 0) cells.push(null);

    const isToday  = (d: number) => d===today.getDate()&&viewMonth===today.getMonth()&&viewYear===today.getFullYear();
    const dayEntry = (d: number) => data[toKey(viewYear, viewMonth, d)];

    const selectDay = (d: number) => { setSelectedKey(toKey(viewYear, viewMonth, d)); setPanelMode('day'); };

    // ── Add event ────────────────────────────────────────────────────────────
    const addEvent = () => {
        if (!evtProject.trim() && !evtName.trim()) return;
        const col = palette.find(p => p.id === evtColorId) ?? palette[0];
        const fromDate = new Date(evtFrom + 'T00:00:00');
        const keys = evtRecurring
            ? datesBetween(evtFrom, evtTo, fromDate.getDay())
            : datesBetween(evtFrom, evtTo);

        setData(prev => {
            const next = { ...prev };
            for (const key of keys) {
                const ex = next[key] ?? empty();
                const newE: ScheduleEntry = {
                    id: `s-${Date.now()}-${key}`,
                    projectNumber: evtProject.trim(),
                    projectName:   evtName.trim(),
                    location:      evtLocation.trim(),
                    startTime:     evtAllDay ? '' : evtStart,
                    endTime:       evtAllDay ? '' : evtEnd,
                    allDay:        evtAllDay,
                    colorId:       col.id,
                    color:         col.color,
                    textColor:     textForBg(col.color),
                };
                const sorted = [...ex.schedule, newE].sort((a, b) => {
                    if (a.allDay && !b.allDay) return -1;
                    if (!a.allDay && b.allDay) return 1;
                    if (!a.startTime && !b.startTime) return 0;
                    if (!a.startTime) return 1; if (!b.startTime) return -1;
                    return a.startTime.localeCompare(b.startTime);
                });
                next[key] = { ...ex, schedule: sorted };
            }
            return next;
        });

        setEvtProject(''); setEvtName(''); setEvtLocation(''); setEvtStart(''); setEvtEnd('');
        setEvtAllDay(false); setEvtRecurring(false);
        const fromYear = parseInt(evtFrom.slice(0,4)), fromMonth = parseInt(evtFrom.slice(5,7))-1;
        setViewYear(fromYear); setViewMonth(fromMonth);
        setSelectedKey(evtFrom);
        setPanelMode('day');
    };

    // ── Tasks ────────────────────────────────────────────────────────────────
    const addTask = () => {
        if (!selectedKey || !newTask.trim()) return;
        const t: Task = { id: Date.now().toString(), text: newTask.trim(), done: false };
        setData(prev => { const e={...empty(),...(prev[selectedKey]??{})}; return{...prev,[selectedKey]:{...e,tasks:[...e.tasks,t]}}; });
        setNewTask('');
    };
    const toggleTask = (id: string) => {
        if (!selectedKey) return;
        setData(prev => { const e={...empty(),...(prev[selectedKey]??{})}; return{...prev,[selectedKey]:{...e,tasks:e.tasks.map(t=>t.id===id?{...t,done:!t.done}:t)}}; });
    };
    const deleteTask = (id: string) => {
        if (!selectedKey) return;
        setData(prev => { const e={...empty(),...(prev[selectedKey]??{})}; return{...prev,[selectedKey]:{...e,tasks:e.tasks.filter(t=>t.id!==id)}}; });
    };
    const removeEvent = (key: string, id: string) => {
        setData(prev => { const e={...empty(),...(prev[key]??{})}; return{...prev,[key]:{...e,schedule:e.schedule.filter(s=>s.id!==id)}}; });
    };
    const updateNotes = (notes: string) => {
        if (!selectedKey) return;
        setData(prev => ({...prev,[selectedKey]:{...empty(),...(prev[selectedKey]??{}),notes}}));
    };

    // ── Paste ────────────────────────────────────────────────────────────────
    const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        e.preventDefault();
        const html = e.clipboardData.getData('text/html');
        const tsv  = e.clipboardData.getData('text/plain');

        interface Cell { value: string; color: string; }
        interface Row  { cells: Cell[]; rowColor: string; }
        let rows: Row[] = [];

        if (html) { try {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const trs = Array.from(doc.querySelectorAll('tr'));
            if (trs.length) rows = trs.map(tr => {
                const cells: Cell[] = Array.from(tr.querySelectorAll('td,th')).map(td => {
                    const el = td as HTMLElement;
                    return { value: norm(el.textContent ?? ''), color: el.style.backgroundColor || '' };
                });
                return { cells, rowColor: cells.find(c => !isTrivial(c.color))?.color ?? '' };
            });
        } catch {} }

        if (!rows.length && tsv) rows = tsv.split('\n').filter(l=>l.trim()).map(l=>({cells:l.split('\t').map(v=>({value:norm(v),color:''})),rowColor:''}));

        const hasDate = (row: Row) => row.cells.some(c => { const n=Number(c.value); return excelSerial(n)!==null||parseDate(c.value)!==null; });
        const startRow = rows.length > 1 && !hasDate(rows[0]) ? 1 : 0;
        const name = norm(myName).toLowerCase();
        let count = 0, firstKey: string|null = null;

        setData(prev => {
            const next = { ...prev };
            for (let ri = startRow; ri < rows.length; ri++) {
                const row = rows[ri];
                const vals = row.cells.map(c => c.value);
                if (name && !vals.some(v => norm(v).toLowerCase().includes(name))) continue;

                let dateKey: string|null = null, dateIdx = -1;
                for (let ci = 0; ci < vals.length; ci++) {
                    const n=Number(vals[ci]); const k=excelSerial(n)??parseDate(vals[ci]);
                    if (k) { dateKey=k; dateIdx=ci; break; }
                }
                if (!dateKey) continue;

                const usedIdx = new Set([dateIdx]);
                if (name) { const ni=vals.findIndex(v=>norm(v).toLowerCase().includes(name)); if(ni>=0)usedIdx.add(ni); }
                const rest = vals.map((v,i)=>({v:v.trim(),i})).filter(({v,i})=>v&&!usedIdx.has(i));
                const label = rest.reduce((a,b)=>b.v.length>a.v.length?b:a,{v:'',i:-1}).v;

                const toHex=(rgb:string)=>{const m=rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);return m?'#'+[+m[1],+m[2],+m[3]].map(x=>x.toString(16).padStart(2,'0')).join(''):rgb;};
                let matchedCol = palette[0];
                if (row.rowColor && !isTrivial(row.rowColor)) {
                    const nr = toHex(row.rowColor).toLowerCase();
                    const match = palette.find(p => toHex(p.color).toLowerCase() === nr);
                    matchedCol = match ?? { id:'import', label:'Imported', color:row.rowColor };
                }

                const ex = next[dateKey] ?? empty();
                if (!(ex.schedule??[]).some(s=>s.projectName===label)) {
                    next[dateKey] = { ...ex, schedule: [...(ex.schedule??[]), { id:`s-${Date.now()}-${ri}`, projectNumber:'', projectName:label, location:'', startTime:'', endTime:'', allDay:false, colorId:matchedCol.id, color:matchedCol.color, textColor:textForBg(matchedCol.color) }] };
                    if (!firstKey) firstKey = dateKey;
                    count++;
                }
            }
            return next;
        });

        if (firstKey) { setViewYear(parseInt(firstKey.slice(0,4))); setViewMonth(parseInt(firstKey.slice(5,7))-1); setSelectedKey(firstKey); }
        setImportMsg(count===0?(name?`No rows found for "${myName}"`:'No dates found'):`${count} day${count!==1?'s':''} imported`);
        setShowPaste(false);
    }, [myName, palette]);

    const selEntry  = selectedKey ? ({...empty(),...(data[selectedKey]??{})}) : null;
    const selPalette = palette.find(p => p.id === evtColorId) ?? palette[0];
    const addDays   = datesBetween(evtFrom, evtTo, evtRecurring ? new Date(evtFrom+'T00:00:00').getDay() : undefined);

    // Timeline constants
    const TIMELINE_START = 6;
    const TIMELINE_END   = 22;
    const TIMELINE_HOURS = TIMELINE_END - TIMELINE_START;
    const PX_PER_HOUR   = 44;
    const [timelineExpanded, setTimelineExpanded] = useState(false);

    return (
        <>
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2">
          <div className="xtec-modal-enter bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-2xl border border-gray-200 dark:border-[#007D8C]/20 w-full max-w-7xl h-[95vh] flex flex-col overflow-hidden">

            {/* ── Top bar ──────────────────────────────────────────────── */}
            <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-gray-100 dark:border-white/5 shrink-0">
                <div className="w-8 h-8 rounded-xl bg-[#007D8C]/10 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-[#007D8C]" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/>
                    </svg>
                </div>
                <div className="flex-1">
                    <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Field Planner</h2>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-gray-400">My name:</span>
                        <input value={myName} onChange={e=>setMyName(e.target.value)} placeholder="e.g. Kole Schreiner"
                            className="text-[10px] bg-transparent text-gray-600 dark:text-gray-300 outline-none border-b border-dashed border-gray-300 dark:border-white/20 focus:border-[#007D8C] w-36 pb-px"/>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {importMsg && (
                        <span className={`text-xs font-medium px-2 py-1 rounded-lg border whitespace-nowrap ${importMsg.startsWith('No')?'text-amber-600 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800':'text-green-600 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'}`}>
                            {importMsg.startsWith('No')?'⚠ ':'✓ '}{importMsg}
                        </span>
                    )}
                    <button onClick={()=>{setPanelMode('add');setEvtFrom(selectedKey);setEvtTo(selectedKey);}}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${panelMode==='add'?'bg-[#007D8C] text-white':'bg-[#007D8C]/10 text-[#007D8C] hover:bg-[#007D8C]/20'}`}>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
                        Add Event
                    </button>
                    <button onClick={()=>{setImportMsg(null);setShowPaste(true);setTimeout(()=>pasteAreaRef.current?.focus(),80);}}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg transition-colors whitespace-nowrap">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"/></svg>
                        Paste Schedule
                    </button>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                        <CloseIcon className="h-4 w-4"/>
                    </button>
                </div>
            </div>

            {/* ── Body ─────────────────────────────────────────────────── */}
            <div className="flex flex-1 min-h-0 overflow-hidden">

              {/* ── Calendar ────────────────────────────────────────────── */}
              <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                {/* Month nav */}
                <div className="flex items-center justify-between px-5 py-2 border-b border-gray-100 dark:border-white/5 shrink-0">
                    <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>
                    </button>
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{MONTHS[viewMonth]} {viewYear}</span>
                        <button onClick={()=>{setViewYear(today.getFullYear());setViewMonth(today.getMonth());setSelectedKey(todayKey);setPanelMode('day');}}
                            className="text-[10px] font-semibold text-[#007D8C] border border-[#007D8C]/30 hover:bg-[#007D8C]/10 px-2 py-0.5 rounded-md transition-colors">
                            Today
                        </button>
                    </div>
                    <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>
                    </button>
                </div>

                {/* DOW headers */}
                <div className="grid grid-cols-7 px-3 pt-2 pb-1 shrink-0">
                    {DOW.map(d=><div key={d} className="text-center text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">{d}</div>)}
                </div>

                {/* Grid */}
                <div className="flex-1 px-2 pb-2 overflow-hidden" style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gridTemplateRows:`repeat(${Math.ceil(cells.length/7)},1fr)`,gap:'3px'}}>
                    {cells.map((day,i) => {
                        if (!day) return <div key={i}/>;
                        const de = dayEntry(day);
                        const scheds = de?.schedule ?? [];
                        const key = toKey(viewYear, viewMonth, day);
                        const todayDay = isToday(day);
                        const isSelected = key === selectedKey;
                        const n = scheds.length;

                        return (
                            <button key={i} onClick={() => selectDay(day)}
                                className={`relative rounded-xl overflow-hidden transition-all focus:outline-none group ${
                                    isSelected ? 'ring-2 ring-[#007D8C] ring-offset-1 dark:ring-offset-[#1c1c1e]' : 'hover:ring-1 hover:ring-[#007D8C]/30'
                                }`}
                            >
                                {/* Cell background (empty) */}
                                {n === 0 && (
                                    <div className={`absolute inset-0 ${todayDay ? 'bg-[#007D8C]/8 dark:bg-[#007D8C]/12' : 'bg-gray-50 dark:bg-white/[0.03]'}`}/>
                                )}
                                {n === 1 && <div className="absolute inset-0" style={{backgroundColor:scheds[0].color}}/>}

                                {/* Date number — always on top, centered */}
                                <div className={`absolute top-1.5 inset-x-0 z-20 text-xs font-bold leading-none text-center ${
                                    n === 0 ? (todayDay ? 'text-[#007D8C]' : 'text-gray-500 dark:text-gray-400') : ''
                                }`}
                                style={n >= 1 ? {color: scheds[0].textColor} : undefined}>
                                    {day}
                                </div>

                                {/* 2+ events: split horizontal strips */}
                                {n >= 2 && (
                                    <div className="absolute inset-0 flex flex-col">
                                        {scheds.slice(0,4).map((s,si) => (
                                            <div key={si} className="flex-1 min-h-0 overflow-hidden flex flex-col items-center justify-center px-1 text-center"
                                                style={{backgroundColor:s.color}}>
                                                {si === 0 && <span className="text-[10px] font-bold opacity-0 leading-none">{day}</span>}
                                                <span className="text-[11px] font-semibold truncate w-full text-center" style={{color:s.textColor}}>
                                                    {!s.allDay && s.startTime ? `${fmt12(s.startTime)} ` : ''}{s.projectName||s.projectNumber||'·'}
                                                </span>
                                                {s.location && <span className="text-[9px] opacity-70 truncate w-full text-center" style={{color:s.textColor}}>📍 {s.location}</span>}
                                            </div>
                                        ))}
                                        {n > 4 && <div className="flex items-center justify-center py-0.5 bg-black/15 dark:bg-white/10"><span className="text-[9px] font-semibold text-gray-100">+{n-4}</span></div>}
                                    </div>
                                )}

                                {/* 1 event — centered label with location */}
                                {n === 1 && (
                                    <div className="absolute inset-0 pt-6 px-1.5 pb-1 flex flex-col items-center text-center">
                                        <span className="text-[11px] font-semibold leading-snug" style={{color:scheds[0].textColor}}>
                                            {!scheds[0].allDay && scheds[0].startTime ? `${fmt12(scheds[0].startTime)} ` : ''}{scheds[0].projectName||scheds[0].projectNumber}
                                        </span>
                                        {scheds[0].location && (
                                            <span className="text-[9px] opacity-70 mt-0.5 truncate max-w-full" style={{color:scheds[0].textColor}}>📍 {scheds[0].location}</span>
                                        )}
                                    </div>
                                )}

                                {/* Notes dot (0 events) */}
                                {n === 0 && (de?.notes?.trim() || de?.tasks?.length) && (
                                    <div className="absolute bottom-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#007D8C]/50"/>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Legend */}
                <div className="px-4 py-2 border-t border-gray-100 dark:border-white/5 flex items-center gap-3 flex-wrap shrink-0 bg-gray-50/40 dark:bg-white/[0.02]">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Legend</span>
                    {palette.map(p=>(
                        <div key={p.id} className="flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-sm shrink-0 border border-black/10 dark:border-white/10" style={{backgroundColor:p.color}}/>
                            <span className="text-[10px] text-gray-600 dark:text-gray-400">{p.label}</span>
                        </div>
                    ))}
                </div>
              </div>

              {/* ── Right Panel ──────────────────────────────────────────── */}
              <div className="w-80 shrink-0 border-l border-gray-100 dark:border-white/5 flex flex-col overflow-hidden bg-gray-50/40 dark:bg-white/[0.02]">

                {panelMode === 'add' ? (
                    /* ── Add Event ── */
                    <>
                        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 dark:border-white/5 shrink-0">
                            <div>
                                <p className="text-sm font-semibold text-gray-800 dark:text-white">Add Event</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Fill in details and press Add</p>
                            </div>
                            <button onClick={()=>setPanelMode('day')} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                                <CloseIcon className="h-4 w-4"/>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">

                            {/* PM Color — first so Off auto-fills */}
                            <div ref={colorRef} className="relative">
                                <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">PM / Color</label>
                                <button onClick={()=>setColorOpen(o=>!o)}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 hover:border-gray-300 dark:hover:border-white/20 transition-colors text-sm text-gray-700 dark:text-gray-200">
                                    <span className="w-4 h-4 rounded-sm shrink-0 border border-black/10 dark:border-white/10" style={{backgroundColor:selPalette?.color}}/>
                                    <span className="flex-1 text-left">{selPalette?.label??'Select'}</span>
                                    <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></svg>
                                </button>
                                {colorOpen && (
                                    <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-white/10 rounded-xl shadow-xl py-1 max-h-48 overflow-y-auto">
                                        {palette.map(p=>(
                                            <button key={p.id} onClick={()=>{setEvtColorId(p.id);setColorOpen(false);}}
                                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors ${evtColorId===p.id?'bg-[#007D8C]/5 dark:bg-[#007D8C]/10':''}`}>
                                                <span className="w-4 h-4 rounded-sm shrink-0 border border-black/10 dark:border-white/10" style={{backgroundColor:p.color}}/>
                                                {p.label}
                                                {evtColorId===p.id&&<svg className="w-3.5 h-3.5 ml-auto text-[#007D8C]" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Project #</label>
                                <input value={evtProject} onChange={e=>setEvtProject(e.target.value)} placeholder="e.g. 2026-042"
                                    className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition"/>
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Project / Site Name</label>
                                <input value={evtName} onChange={e=>setEvtName(e.target.value)} placeholder="e.g. Cenovus B1K Site 3"
                                    className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition"/>
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Location</label>
                                <input value={evtLocation} onChange={e=>setEvtLocation(e.target.value)} placeholder="e.g. Fort McMurray, AB"
                                    className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition"/>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">From</label>
                                    <input type="date" value={evtFrom} onChange={e=>{setEvtFrom(e.target.value);if(!evtTo||evtTo<e.target.value)setEvtTo(e.target.value);}}
                                        className="w-full text-sm px-2.5 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-800 dark:text-white focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition"/>
                                </div>
                                <div>
                                    <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">To</label>
                                    <input type="date" value={evtTo} min={evtFrom} onChange={e=>setEvtTo(e.target.value)}
                                        className="w-full text-sm px-2.5 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-800 dark:text-white focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition"/>
                                </div>
                            </div>

                            {/* Checkboxes */}
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={evtAllDay} onChange={e=>setEvtAllDay(e.target.checked)}
                                        className="w-4 h-4 accent-[#007D8C] rounded"/>
                                    <span className="text-sm text-gray-700 dark:text-gray-200">All day</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={evtRecurring} onChange={e=>setEvtRecurring(e.target.checked)}
                                        className="w-4 h-4 accent-[#007D8C] rounded"/>
                                    <span className="text-sm text-gray-700 dark:text-gray-200">Repeat weekly <span className="text-gray-400 dark:text-gray-500 text-xs">(same day of week)</span></span>
                                </label>
                            </div>

                            {/* Time fields — hidden when all day */}
                            {!evtAllDay && (
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Start</label>
                                        <input type="time" value={evtStart} onChange={e=>setEvtStart(e.target.value)}
                                            className="w-full text-sm px-2.5 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-800 dark:text-white focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition"/>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">End</label>
                                        <input type="time" value={evtEnd} onChange={e=>setEvtEnd(e.target.value)}
                                            className="w-full text-sm px-2.5 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-800 dark:text-white focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition"/>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="px-5 pb-5 pt-2 shrink-0 border-t border-gray-100 dark:border-white/5">
                            {addDays.length > 1 && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 text-center">
                                    Adding to {addDays.length} days{evtRecurring ? ' (weekly)' : ''}
                                </p>
                            )}
                            <button onClick={addEvent} disabled={!evtProject.trim()&&!evtName.trim()}
                                className="w-full py-2.5 bg-[#007D8C] hover:bg-[#006270] disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors">
                                Add Event{addDays.length > 1 ? ` (${addDays.length})` : ''}
                            </button>
                        </div>
                    </>
                ) : (
                    /* ── Day View ── */
                    <>
                        <div className="px-5 pt-4 pb-3 border-b border-gray-100 dark:border-white/5 shrink-0">
                            <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">
                                {selectedKey ? fmtDayHeading(selectedKey) : 'Select a day'}
                            </p>
                            {selectedKey===todayKey && <span className="text-[10px] font-semibold uppercase tracking-widest text-[#007D8C]">Today</span>}
                        </div>

                        {selEntry && selectedKey ? (
                            <div className="flex-1 overflow-y-auto">

                                {/* Schedule section */}
                                {selEntry.schedule.length > 0 && (
                                    <div className="px-4 pt-4 pb-2">
                                        {/* Section header with timeline toggle */}
                                        <div className="flex items-center justify-between mb-3">
                                            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#007D8C]">Schedule</p>
                                            {selEntry.schedule.filter(s=>!s.allDay&&s.startTime).length > 0 && (
                                                <button onClick={()=>setTimelineExpanded(v=>!v)}
                                                    className="flex items-center gap-1 text-[10px] font-medium text-gray-500 dark:text-gray-400 hover:text-[#007D8C] dark:hover:text-[#007D8C] transition-colors">
                                                    <svg className={`w-3 h-3 transition-transform ${timelineExpanded?'rotate-180':''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></svg>
                                                    {timelineExpanded ? 'Hide timeline' : 'Show timeline'}
                                                </button>
                                            )}
                                        </div>

                                        {/* All-day events */}
                                        {selEntry.schedule.filter(s=>s.allDay).map(s=>(
                                            <div key={s.id} className="group flex items-center gap-2 mb-2 p-2.5 rounded-xl" style={{backgroundColor:s.color,color:s.textColor}}>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[10px] font-bold opacity-70 mb-0.5 uppercase tracking-wide">All Day</p>
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        {s.projectNumber&&<span className="text-xs font-bold bg-black/20 dark:bg-white/20 rounded px-1">{s.projectNumber}</span>}
                                                        {s.projectName&&<span className="text-sm font-semibold">{s.projectName}</span>}
                                                    </div>
                                                    {s.location&&<p className="text-[10px] opacity-70 mt-0.5">📍 {s.location}</p>}
                                                    <p className="text-[10px] opacity-60 mt-0.5">{palette.find(p=>p.id===s.colorId)?.label??''}</p>
                                                </div>
                                                <button onClick={()=>removeEvent(selectedKey,s.id)} className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity shrink-0" style={{color:s.textColor}}>
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                                                </button>
                                            </div>
                                        ))}

                                        {/* Compact event list (collapsed) */}
                                        {!timelineExpanded && selEntry.schedule.filter(s=>!s.allDay).map(s=>(
                                            <div key={s.id} className="group flex items-center gap-2 mb-1.5 p-2 rounded-lg" style={{backgroundColor:s.color,color:s.textColor}}>
                                                <div className="flex-1 min-w-0 flex items-center gap-2">
                                                    {s.startTime&&<span className="text-[10px] font-bold opacity-80 shrink-0">{fmt12(s.startTime)}</span>}
                                                    {s.projectNumber&&<span className="text-[10px] font-bold bg-black/20 dark:bg-white/20 rounded px-1">{s.projectNumber}</span>}
                                                    <span className="text-xs font-semibold truncate">{s.projectName||'·'}</span>
                                                    {s.location&&<span className="text-[10px] opacity-70 truncate">📍{s.location}</span>}
                                                </div>
                                                <button onClick={()=>removeEvent(selectedKey,s.id)} className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity shrink-0" style={{color:s.textColor}}>
                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                                                </button>
                                            </div>
                                        ))}

                                        {/* Full timeline (expanded) */}
                                        {timelineExpanded && selEntry.schedule.filter(s=>!s.allDay&&s.startTime).length > 0 && (
                                            <div className="relative mt-2" style={{height:`${TIMELINE_HOURS*PX_PER_HOUR}px`}}>
                                                {Array.from({length:TIMELINE_HOURS+1},(_,i)=>i+TIMELINE_START).map(h=>(
                                                    <div key={h} className="absolute left-0 right-0 flex items-center" style={{top:`${(h-TIMELINE_START)*PX_PER_HOUR}px`}}>
                                                        <span className="text-[9px] text-gray-400 dark:text-gray-600 w-10 shrink-0 text-right pr-1.5">{fmt12(`${String(h).padStart(2,'0')}:00`)}</span>
                                                        <div className="flex-1 h-px bg-gray-200 dark:bg-white/5"/>
                                                    </div>
                                                ))}
                                                {selEntry.schedule.filter(s=>!s.allDay&&s.startTime).map(s=>{
                                                    const sm=startMins(s), dm=durationMins(s);
                                                    const topPx=((sm/60)-TIMELINE_START)*PX_PER_HOUR;
                                                    const hPx=(dm/60)*PX_PER_HOUR;
                                                    if(topPx<0||topPx>TIMELINE_HOURS*PX_PER_HOUR)return null;
                                                    return(
                                                        <div key={s.id} className="group absolute left-12 right-0 rounded-lg overflow-hidden shadow-sm"
                                                            style={{top:`${topPx}px`,height:`${Math.max(22,hPx)}px`,backgroundColor:s.color,color:s.textColor}}>
                                                            <div className="px-1.5 py-0.5 h-full flex flex-col justify-center">
                                                                <p className="text-[9px] font-bold opacity-80 leading-none">{fmt12(s.startTime)}{s.endTime?`–${fmt12(s.endTime)}`:''}</p>
                                                                <p className="text-[10px] font-semibold leading-tight truncate">{s.projectName||s.projectNumber}</p>
                                                                {s.location&&<p className="text-[9px] opacity-70 truncate">📍{s.location}</p>}
                                                            </div>
                                                            <button onClick={()=>removeEvent(selectedKey,s.id)} className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity" style={{color:s.textColor}}>
                                                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Events without times */}
                                        {selEntry.schedule.filter(s=>!s.allDay&&!s.startTime).map(s=>(
                                            <div key={s.id} className="group flex items-start gap-2 mt-2 p-2.5 rounded-xl" style={{backgroundColor:s.color,color:s.textColor}}>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        {s.projectNumber&&<span className="text-xs font-bold bg-black/20 dark:bg-white/20 rounded px-1">{s.projectNumber}</span>}
                                                        {s.projectName&&<span className="text-sm font-semibold">{s.projectName}</span>}
                                                    </div>
                                                    {s.location&&<p className="text-[10px] opacity-70 mt-0.5">📍 {s.location}</p>}
                                                    <p className="text-[10px] opacity-60 mt-0.5">{palette.find(p=>p.id===s.colorId)?.label??''}</p>
                                                </div>
                                                <button onClick={()=>removeEvent(selectedKey,s.id)} className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity shrink-0" style={{color:s.textColor}}>
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Tasks */}
                                <div className="px-5 pb-3 pt-4 border-t border-gray-100 dark:border-white/5">
                                    <p className="text-[11px] font-semibold uppercase tracking-widest text-[#007D8C] mb-2">Tasks</p>
                                    <div className="space-y-1.5 mb-2">
                                        {!(selEntry.tasks??[]).length&&<p className="text-xs text-gray-400 dark:text-gray-600 italic">No tasks</p>}
                                        {(selEntry.tasks??[]).map(t=>(
                                            <div key={t.id} className="flex items-center gap-2 group">
                                                <button onClick={()=>toggleTask(t.id)} className={`w-4 h-4 rounded shrink-0 border-2 flex items-center justify-center transition-colors ${t.done?'bg-[#007D8C] border-[#007D8C]':'border-gray-300 dark:border-white/20 hover:border-[#007D8C]'}`}>
                                                    {t.done&&<svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>}
                                                </button>
                                                <span className={`flex-1 text-sm ${t.done?'line-through text-gray-400 dark:text-gray-600':'text-gray-700 dark:text-gray-200'}`}>{t.text}</span>
                                                <button onClick={()=>deleteTask(t.id)} className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-500 transition-all">
                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <input value={newTask} onChange={e=>setNewTask(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addTask();}} placeholder="Add a task..."
                                            className="flex-1 text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition"/>
                                        <button onClick={addTask} className="px-3 py-1.5 bg-[#007D8C] hover:bg-[#006270] text-white text-sm font-semibold rounded-lg transition-colors">Add</button>
                                    </div>
                                </div>

                                {/* Notes */}
                                <div className="px-5 pb-5">
                                    <p className="text-[11px] font-semibold uppercase tracking-widest text-[#007D8C] mb-2">Notes</p>
                                    <textarea value={selEntry.notes} onChange={e=>updateNotes(e.target.value)} rows={3} placeholder="Add notes for this day..."
                                        className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition resize-none"/>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center">
                                <p className="text-sm text-gray-400 dark:text-gray-600">Click a day to view</p>
                            </div>
                        )}
                    </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Paste dialog ──────────────────────────────────────────────────── */}
        {showPaste && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
                <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-2xl border border-gray-200 dark:border-[#007D8C]/20 w-full max-w-md overflow-hidden">
                    <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-white/5">
                        <div>
                            <h3 className="text-base font-semibold text-gray-800 dark:text-white">Paste from Excel</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Select All → Copy → paste below.<br/>Only <strong className="text-gray-700 dark:text-gray-200">"{myName||'your name'}"</strong> rows are imported.</p>
                        </div>
                        <button onClick={()=>setShowPaste(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                            <CloseIcon className="h-4 w-4"/>
                        </button>
                    </div>
                    <div className="px-6 py-5">
                        <textarea ref={pasteAreaRef} onPaste={handlePaste} readOnly rows={5} placeholder="Click here, then Ctrl+V / ⌘V"
                            className="w-full text-sm px-4 py-8 rounded-xl border-2 border-dashed border-[#007D8C]/30 bg-[#007D8C]/5 dark:bg-[#007D8C]/10 text-gray-400 dark:text-gray-500 focus:border-[#007D8C] focus:outline-none transition-colors resize-none text-center cursor-pointer"/>
                        <p className="text-[11px] text-gray-400 dark:text-gray-600 text-center mt-2">Row colors are matched to the legend palette automatically.</p>
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

export default CalendarPlanner;
