import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CloseIcon } from './icons';

// ─── Color palette (PM / person colors) ─────────────────────────────────────

interface ColorEntry { id: string; label: string; color: string; }

const DEFAULT_PALETTE: ColorEntry[] = [
    { id: 'jeff-k',    label: 'Jeff K.',          color: '#FFFF00' },
    { id: 'lacey',     label: 'Lacey Teasdale',   color: '#55D4CF' },
    { id: 'tyson',     label: 'Tyson Doering',    color: '#2F6EBA' },
    { id: 'jostein',   label: 'Jostein Kevinsen', color: '#FF37CF' },
    { id: 'brian',     label: 'Brian',            color: '#FFC000' },
    { id: 'kirsten',   label: 'Kirsten',          color: '#92D050' },
    { id: 'off',       label: 'Off',              color: '#222222' },
];

const PALETTE_KEY = 'xtec_planner_palette';

const loadPalette = (): ColorEntry[] => {
    try { const r = localStorage.getItem(PALETTE_KEY); return r ? JSON.parse(r) : DEFAULT_PALETTE; }
    catch { return DEFAULT_PALETTE; }
};

// ─── Data model ──────────────────────────────────────────────────────────────

interface ScheduleEntry {
    id: string;
    projectNumber: string;
    projectName: string;
    startTime: string;  // "HH:MM" 24h, empty = all day
    endTime: string;    // "HH:MM" 24h, empty = no end time
    colorId: string;
    color: string;      // cached hex
    textColor: string;  // auto black/white
}

const fmt12 = (t: string): string => {
    if (!t) return '';
    const [hStr, mStr] = t.split(':');
    const h = parseInt(hStr, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12  = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${mStr} ${ampm}`;
};

const timeLabel = (s: ScheduleEntry): string => {
    if (!s.startTime && !s.endTime) return '';
    if (s.startTime && s.endTime) return `${fmt12(s.startTime)} – ${fmt12(s.endTime)}`;
    return fmt12(s.startTime || s.endTime);
};

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
            const sched = (v?.schedule ?? []).map((s: any) => ({
                startTime: '', endTime: '', ...s,
            }));
            out[k] = { notes: v?.notes ?? '', tasks: v?.tasks ?? [], schedule: sched };
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

const textForBg = (c: string): string => {
    try {
        let r=255,g=255,b=255;
        const m = c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (m) { r=+m[1];g=+m[2];b=+m[3]; }
        else if (c.startsWith('#') && c.length>=7) {
            r=parseInt(c.slice(1,3),16);g=parseInt(c.slice(3,5),16);b=parseInt(c.slice(5,7),16);
        }
        return (0.299*r+0.587*g+0.114*b)/255 > 0.5 ? '#1a1a1a' : '#ffffff';
    } catch { return '#1a1a1a'; }
};

// ─── Clipboard import helpers ─────────────────────────────────────────────────

const norm = (s: string) => (s ?? '').replace(/[   ]/g, ' ').replace(/\s+/g,' ').trim();

const parseDate = (s: string): string | null => {
    const v = norm(s); if (!v || v.length < 4) return null;
    const iso = v.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (iso) return `${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`;
    const mdy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`;
    const dmy = v.match(/^(\d{1,2})[.\-](\d{1,2})[.\-](\d{2,4})/);
    if (dmy) { const y=dmy[3].length===2?`20${dmy[3]}`:dmy[3]; return `${y}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`; }
    const d = new Date(v);
    if (!isNaN(d.getTime())&&d.getFullYear()>2000) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return null;
};

const excelSerial = (n: number): string | null => {
    if (!Number.isFinite(n)||n<40000||n>60000) return null;
    const d = new Date(Date.UTC(1899,11,30)+n*86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
};

const isTrivial = (c:string) => { if(!c||c==='transparent'||c.startsWith('rgba(0')) return true; const m=c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/); if(m&&+m[1]>240&&+m[2]>240&&+m[3]>240) return true; return c==='#ffffff'||c==='#fff'||c==='white'; };

// ─── Component ───────────────────────────────────────────────────────────────

interface CalendarPlannerProps { onClose: () => void; }

const CalendarPlanner: React.FC<CalendarPlannerProps> = ({ onClose }) => {
    const today = new Date();
    const [viewYear,    setViewYear]    = useState(today.getFullYear());
    const [viewMonth,   setViewMonth]   = useState(today.getMonth());
    const [selectedKey, setSelectedKey] = useState<string | null>(toKey(today.getFullYear(),today.getMonth(),today.getDate()));
    const [data,        setData]        = useState<PlannerData>(load);
    const [palette,     setPalette]     = useState<ColorEntry[]>(loadPalette);
    const [myName,      setMyName]      = useState(()=>localStorage.getItem(MY_NAME_KEY)??'');
    const [showPaste,   setShowPaste]   = useState(false);
    const [importMsg,   setImportMsg]   = useState<string|null>(null);
    const [showPalette, setShowPalette] = useState(false);
    const pasteAreaRef = useRef<HTMLTextAreaElement>(null);

    // New event form
    const [newProjectNum,  setNewProjectNum]  = useState('');
    const [newProjectName, setNewProjectName] = useState('');
    const [newStartTime,   setNewStartTime]   = useState('');
    const [newEndTime,     setNewEndTime]     = useState('');
    const [newColorId,     setNewColorId]     = useState(palette[0]?.id ?? '');
    const [newTask,        setNewTask]         = useState('');

    useEffect(()=>{ persist(data); },[data]);
    useEffect(()=>{ localStorage.setItem(MY_NAME_KEY,myName); },[myName]);
    useEffect(()=>{ localStorage.setItem(PALETTE_KEY,JSON.stringify(palette)); },[palette]);

    // ── Navigation ──────────────────────────────────────────────────────────
    const prevMonth = () => { if(viewMonth===0){setViewMonth(11);setViewYear(v=>v-1);}else setViewMonth(m=>m-1); };
    const nextMonth = () => { if(viewMonth===11){setViewMonth(0);setViewYear(v=>v+1);}else setViewMonth(m=>m+1); };

    const firstDay    = new Date(viewYear,viewMonth,1).getDay();
    const daysInMonth = new Date(viewYear,viewMonth+1,0).getDate();
    const cells:(number|null)[] = [...Array(firstDay).fill(null),...Array.from({length:daysInMonth},(_,i)=>i+1)];
    while(cells.length%7!==0) cells.push(null);

    const entry      = selectedKey ? ({...empty(),...(data[selectedKey]??{})}) : null;
    const isToday    = (d:number) => d===today.getDate()&&viewMonth===today.getMonth()&&viewYear===today.getFullYear();
    const isSelected = (d:number) => selectedKey===toKey(viewYear,viewMonth,d);
    const dayEntry   = (d:number) => data[toKey(viewYear,viewMonth,d)];

    const getColor = (colorId:string) => palette.find(p=>p.id===colorId)?.color ?? '#007D8C';

    // ── Add schedule entry ───────────────────────────────────────────────────
    const addScheduleEntry = () => {
        if (!selectedKey || (!newProjectNum.trim() && !newProjectName.trim())) return;
        const colorEntry = palette.find(p=>p.id===newColorId) ?? palette[0];
        const newEntry: ScheduleEntry = {
            id: `s-${Date.now()}`,
            projectNumber: newProjectNum.trim(),
            projectName:   newProjectName.trim(),
            startTime:     newStartTime,
            endTime:       newEndTime,
            colorId:       colorEntry.id,
            color:         colorEntry.color,
            textColor:     textForBg(colorEntry.color),
        };
        setData(prev => {
            const e = {...empty(),...(prev[selectedKey]??{})};
            const sorted = [...e.schedule, newEntry].sort((a,b) => {
                if (!a.startTime && !b.startTime) return 0;
                if (!a.startTime) return 1;
                if (!b.startTime) return -1;
                return a.startTime.localeCompare(b.startTime);
            });
            return {...prev,[selectedKey]:{...e,schedule:sorted}};
        });
        setNewProjectNum('');
        setNewProjectName('');
        setNewStartTime('');
        setNewEndTime('');
    };

    const removeSchedule = (sid:string) => {
        if(!selectedKey) return;
        setData(prev=>{const e={...empty(),...(prev[selectedKey]??{})};return{...prev,[selectedKey]:{...e,schedule:e.schedule.filter(s=>s.id!==sid)}};});
    };

    // ── Notes / tasks ────────────────────────────────────────────────────────
    const updateNotes = (notes:string) => {
        if(!selectedKey) return;
        setData(prev=>({...prev,[selectedKey]:{...empty(),...(prev[selectedKey]??{}),notes}}));
    };
    const addTask = () => {
        if(!selectedKey||!newTask.trim()) return;
        const t={id:Date.now().toString(),text:newTask.trim(),done:false};
        setData(prev=>{const e={...empty(),...(prev[selectedKey]??{})};return{...prev,[selectedKey]:{...e,tasks:[...e.tasks,t]}};});
        setNewTask('');
    };
    const toggleTask=(id:string)=>{ if(!selectedKey)return; setData(prev=>{const e={...empty(),...(prev[selectedKey]??{})};return{...prev,[selectedKey]:{...e,tasks:e.tasks.map(t=>t.id===id?{...t,done:!t.done}:t)}};});};
    const deleteTask=(id:string)=>{ if(!selectedKey)return; setData(prev=>{const e={...empty(),...(prev[selectedKey]??{})};return{...prev,[selectedKey]:{...e,tasks:e.tasks.filter(t=>t.id!==id)}};});};

    // ── Paste ────────────────────────────────────────────────────────────────
    const handlePaste = useCallback((e:React.ClipboardEvent<HTMLTextAreaElement>)=>{
        e.preventDefault();
        const html=e.clipboardData.getData('text/html');
        const tsv=e.clipboardData.getData('text/plain');

        interface Cell{value:string;color:string;}
        interface Row{cells:Cell[];rowColor:string;}
        let rows:Row[]=[];

        if(html){try{
            const doc=new DOMParser().parseFromString(html,'text/html');
            const trs=Array.from(doc.querySelectorAll('tr'));
            if(trs.length){rows=trs.map(tr=>{
                const cells:Cell[]=Array.from(tr.querySelectorAll('td,th')).map(td=>{const el=td as HTMLElement;return{value:norm(el.textContent??''),color:el.style.backgroundColor||''};});
                const rowColor=cells.find(c=>!isTrivial(c.color))?.color??'';
                return{cells,rowColor};
            });}
        }catch{}}

        if(!rows.length&&tsv){rows=tsv.split('\n').filter(l=>l.trim()).map(l=>({cells:l.split('\t').map(v=>({value:norm(v),color:''})),rowColor:''}));}

        const hasDate=(row:Row)=>row.cells.some(c=>{const n=Number(c.value);return excelSerial(n)!==null||parseDate(c.value)!==null;});
        const startRow=rows.length>1&&!hasDate(rows[0])?1:0;

        const name=norm(myName).toLowerCase();
        let count=0;
        let firstKey:string|null=null;

        setData(prev=>{
            const next={...prev};
            for(let ri=startRow;ri<rows.length;ri++){
                const row=rows[ri];
                const values=row.cells.map(c=>c.value);
                if(name&&!values.some(v=>norm(v).toLowerCase().includes(name)))continue;

                let dateKey:string|null=null,dateIdx=-1;
                for(let ci=0;ci<values.length;ci++){const v=values[ci];const num=Number(v);const k=excelSerial(num)??parseDate(v);if(k){dateKey=k;dateIdx=ci;break;}}
                if(!dateKey)continue;

                const usedIdx=new Set([dateIdx]);
                if(name){const ni=values.findIndex(v=>norm(v).toLowerCase().includes(name));if(ni>=0)usedIdx.add(ni);}
                const rest=values.map((v,i)=>({v:v.trim(),i})).filter(({v,i})=>v&&!usedIdx.has(i));
                const label=rest.reduce((a,b)=>b.v.length>a.v.length?b:a,{v:'',i:-1}).v;

                // Match Excel row color to palette
                const rowColor=row.rowColor;
                let matchedPalette=palette[0];
                if(rowColor&&!isTrivial(rowColor)){
                    const hexFromRgb=(rgb:string)=>{const m=rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);if(!m)return rgb;return '#'+[+m[1],+m[2],+m[3]].map(x=>x.toString(16).padStart(2,'0')).join('');};
                    const normalize=(h:string)=>h.startsWith('rgb')?hexFromRgb(h):h;
                    const normRow=normalize(rowColor).toLowerCase();
                    const match=palette.find(p=>normalize(p.color).toLowerCase()===normRow);
                    if(match)matchedPalette=match;
                    else matchedPalette={id:'import',label:'Imported',color:rowColor};
                }

                const schedEntry:ScheduleEntry={
                    id:`s-${Date.now()}-${ri}`,
                    projectNumber:'',
                    projectName:label,
                    startTime:'',
                    endTime:'',
                    colorId:matchedPalette.id,
                    color:matchedPalette.color,
                    textColor:textForBg(matchedPalette.color),
                };
                const ex=next[dateKey]??empty();
                const dup=(ex.schedule??[]).some(s=>s.projectName===label);
                if(!dup){next[dateKey]={...ex,schedule:[...(ex.schedule??[]),schedEntry]};if(!firstKey)firstKey=dateKey;count++;}
            }
            return next;
        });

        if(firstKey){setViewYear(parseInt(firstKey.slice(0,4)));setViewMonth(parseInt(firstKey.slice(5,7))-1);}
        setImportMsg(count===0?(name?`No rows found for "${myName}" — check name matches exactly`:'No dates found'):`${count} day${count!==1?'s':''} imported`);
        setShowPaste(false);
    },[myName,palette]);

    const selectedDisplay = selectedKey
        ? new Date(parseInt(selectedKey.slice(0,4)),parseInt(selectedKey.slice(5,7))-1,parseInt(selectedKey.slice(8,10)))
              .toLocaleDateString('en-CA',{weekday:'long',month:'long',day:'numeric',year:'numeric'})
        : '';

    return (
        <>
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2">
            <div className="xtec-modal-enter bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-2xl border border-gray-200 dark:border-[#007D8C]/20 w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden">

                {/* ── Header ── */}
                <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 dark:border-white/5 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-[#007D8C]/10 flex items-center justify-center shrink-0">
                            <svg className="w-4 h-4 text-[#007D8C]" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Field Planner</h2>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-gray-400">My name:</span>
                                <input value={myName} onChange={e=>setMyName(e.target.value)} placeholder="e.g. Kole Schreiner"
                                    className="text-[10px] bg-transparent text-gray-600 dark:text-gray-300 outline-none border-b border-dashed border-gray-300 dark:border-white/20 focus:border-[#007D8C] w-32 pb-px"/>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {importMsg && (
                            <span className={`text-xs font-medium px-2 py-1 rounded-lg border ${importMsg.startsWith('No')?'text-amber-600 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800':'text-green-600 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'}`}>
                                {importMsg.startsWith('No')?'⚠ ':'✓ '}{importMsg}
                            </span>
                        )}
                        <button onClick={()=>{setImportMsg(null);setShowPaste(true);setTimeout(()=>pasteAreaRef.current?.focus(),80);}}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#007D8C] border border-[#007D8C]/30 hover:bg-[#007D8C]/10 rounded-lg transition-colors">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"/></svg>
                            Paste Schedule
                        </button>
                        <button onClick={()=>setShowPalette(true)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg transition-colors">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z"/></svg>
                            Colors
                        </button>
                        <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                            <CloseIcon className="h-4 w-4"/>
                        </button>
                    </div>
                </div>

                {/* ── Body ── */}
                <div className="flex flex-1 min-h-0 overflow-hidden">

                    {/* ── Calendar ── */}
                    <div className="w-[520px] min-w-[520px] flex flex-col border-r border-gray-100 dark:border-white/5">
                        {/* Month nav */}
                        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 dark:border-white/5">
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

                        {/* Day-of-week headers */}
                        <div className="grid grid-cols-7 px-3 pt-2 pb-1">
                            {DOW.map(d=><div key={d} className="text-center text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">{d}</div>)}
                        </div>

                        {/* Calendar grid */}
                        <div className="grid grid-cols-7 px-3 pb-3 gap-1 flex-1 auto-rows-[1fr]">
                            {cells.map((day,i)=>{
                                if(!day) return <div key={i}/>;
                                const de = dayEntry(day);
                                const schedules = de?.schedule ?? [];
                                const primaryColor = schedules[0]?.color;
                                const selected = isSelected(day);
                                const today_   = isToday(day);

                                return (
                                    <button key={i} onClick={()=>setSelectedKey(toKey(viewYear,viewMonth,day))}
                                        className={`relative flex flex-col items-start p-1 rounded-lg transition-all min-h-[52px] text-left border ${
                                            selected
                                                ? 'ring-2 ring-[#007D8C] ring-offset-1 dark:ring-offset-[#1c1c1e]'
                                                : 'hover:ring-1 hover:ring-[#007D8C]/40'
                                        } ${schedules.length ? '' : today_ ? 'border-[#007D8C]/50 bg-[#007D8C]/8' : 'border-transparent'}`}
                                        style={schedules.length ? {
                                            backgroundColor: primaryColor + '33',  // 20% opacity background tint
                                            borderColor: primaryColor + '66',
                                        } : undefined}
                                    >
                                        {/* Date number */}
                                        <span className={`text-xs font-bold leading-none mb-1 ${
                                            today_ ? 'text-[#007D8C]' : 'text-gray-700 dark:text-gray-200'
                                        }`}>{day}</span>

                                        {/* Color strips for each schedule entry */}
                                        {schedules.length > 0 && (
                                            <div className="w-full flex flex-col gap-0.5">
                                                {schedules.slice(0,3).map((s,si)=>(
                                                    <div key={si} className="w-full rounded-sm px-1 truncate text-[10px] font-medium leading-tight py-0.5"
                                                        style={{backgroundColor:s.color,color:s.textColor}}>
                                                        {s.startTime ? `${fmt12(s.startTime)} ` : ''}{s.projectName || s.projectNumber || '·'}
                                                    </div>
                                                ))}
                                                {schedules.length > 3 && (
                                                    <span className="text-[9px] text-gray-500 dark:text-gray-400 pl-0.5">+{schedules.length-3} more</span>
                                                )}
                                            </div>
                                        )}

                                        {/* Notes dot */}
                                        {!schedules.length && (de?.notes?.trim()||de?.tasks?.length) && (
                                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 mt-auto"/>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Color key / legend */}
                        <div className="px-3 pb-3 border-t border-gray-100 dark:border-white/5 pt-2">
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1.5">Legend</p>
                            <div className="flex flex-wrap gap-1.5">
                                {palette.map(p=>(
                                    <div key={p.id} className="flex items-center gap-1">
                                        <span className="w-3 h-3 rounded-sm shrink-0 border border-black/10" style={{backgroundColor:p.color}}/>
                                        <span className="text-[10px] text-gray-600 dark:text-gray-400">{p.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* ── Day detail ── */}
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

                                    {/* Add schedule entry */}
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#007D8C] mb-3">Add Event</p>
                                        <div className="space-y-2">
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Project #</label>
                                                    <input value={newProjectNum} onChange={e=>setNewProjectNum(e.target.value)}
                                                        placeholder="e.g. 2026-042"
                                                        className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition"/>
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Project / Site Name</label>
                                                    <input value={newProjectName} onChange={e=>setNewProjectName(e.target.value)}
                                                        placeholder="e.g. Cenovus B1K Site 3"
                                                        className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition"/>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Start Time</label>
                                                    <input type="time" value={newStartTime} onChange={e=>setNewStartTime(e.target.value)}
                                                        className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-800 dark:text-white focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition"/>
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-1">End Time <span className="font-normal opacity-60">(optional)</span></label>
                                                    <input type="time" value={newEndTime} onChange={e=>setNewEndTime(e.target.value)}
                                                        className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-800 dark:text-white focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition"/>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-1">PM / Color</label>
                                                <div className="flex gap-1.5 flex-wrap">
                                                    {palette.map(p=>(
                                                        <button key={p.id} onClick={()=>setNewColorId(p.id)} title={p.label}
                                                            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium transition-all text-gray-700 dark:text-gray-200 bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20 ${newColorId===p.id?'ring-2 ring-[#007D8C] ring-offset-1 dark:ring-offset-[#1c1c1e] !border-[#007D8C]/40':''}`}>
                                                            <span className="w-3 h-3 rounded-sm shrink-0 border border-black/10 dark:border-white/10" style={{backgroundColor:p.color}}/>
                                                            {p.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <button onClick={addScheduleEntry}
                                                disabled={!newProjectNum.trim()&&!newProjectName.trim()}
                                                className="w-full py-2 bg-[#007D8C] hover:bg-[#006270] disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors">
                                                Add Event
                                            </button>
                                        </div>
                                    </div>

                                    {/* Existing schedule entries */}
                                    {(entry.schedule??[]).length > 0 && (
                                        <div>
                                            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#007D8C] mb-2">Scheduled</p>
                                            <div className="space-y-1.5">
                                                {(entry.schedule??[]).map(s=>(
                                                    <div key={s.id} className="group flex items-center gap-2 p-2.5 rounded-xl" style={{backgroundColor:s.color,color:s.textColor}}>
                                                        <div className="flex-1 min-w-0">
                                                            {timeLabel(s) && (
                                                                <p className="text-[10px] font-bold opacity-70 mb-0.5 tracking-wide">{timeLabel(s)}</p>
                                                            )}
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                {s.projectNumber && <span className="text-xs font-bold bg-black/20 dark:bg-white/20 rounded px-1">{s.projectNumber}</span>}
                                                                {s.projectName && <span className="text-sm font-semibold">{s.projectName}</span>}
                                                            </div>
                                                            <p className="text-[10px] opacity-60 mt-0.5">{palette.find(p=>p.id===s.colorId)?.label ?? ''}</p>
                                                        </div>
                                                        <button onClick={()=>removeSchedule(s.id)}
                                                            className="opacity-0 group-hover:opacity-70 hover:!opacity-100 shrink-0 transition-opacity"
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
                                        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#007D8C] mb-2">Notes</p>
                                        <textarea value={entry.notes} onChange={e=>updateNotes(e.target.value)}
                                            placeholder="Add notes for this day..." rows={2}
                                            className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition resize-none"/>
                                    </div>

                                    {/* Tasks */}
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#007D8C] mb-2">Tasks</p>
                                        <div className="space-y-1.5 mb-2">
                                            {!(entry.tasks??[]).length&&<p className="text-xs text-gray-400 dark:text-gray-600 italic">No tasks</p>}
                                            {(entry.tasks??[]).map(t=>(
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
                                            <input value={newTask} onChange={e=>setNewTask(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addTask();}}
                                                placeholder="Add a task..."
                                                className="flex-1 text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition"/>
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

        {/* ── Paste dialog ── */}
        {showPaste && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
                <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-2xl border border-gray-200 dark:border-[#007D8C]/20 w-full max-w-md overflow-hidden">
                    <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-white/5">
                        <div>
                            <h3 className="text-base font-semibold text-gray-800 dark:text-white">Paste from Excel</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Select All in Excel → Copy → paste below. Only rows with <strong className="text-gray-700 dark:text-gray-200">"{myName||'your name'}"</strong> are imported.</p>
                        </div>
                        <button onClick={()=>setShowPaste(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"><CloseIcon className="h-4 w-4"/></button>
                    </div>
                    <div className="px-6 py-5">
                        <textarea ref={pasteAreaRef} onPaste={handlePaste} readOnly rows={4}
                            placeholder="Click here, then Ctrl+V / ⌘V"
                            className="w-full text-sm px-4 py-8 rounded-xl border-2 border-dashed border-[#007D8C]/30 bg-[#007D8C]/5 dark:bg-[#007D8C]/10 text-gray-400 dark:text-gray-500 focus:border-[#007D8C] focus:outline-none transition-colors resize-none text-center cursor-pointer"/>
                        <p className="text-[11px] text-gray-400 dark:text-gray-600 text-center mt-2">Excel row colors are matched to the legend palette.</p>
                    </div>
                </div>
            </div>
        )}

        {/* ── Palette editor ── */}
        {showPalette && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
                <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-2xl border border-gray-200 dark:border-[#007D8C]/20 w-full max-w-sm overflow-hidden">
                    <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-white/5">
                        <h3 className="text-base font-semibold text-gray-800 dark:text-white">Color Legend</h3>
                        <button onClick={()=>setShowPalette(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"><CloseIcon className="h-4 w-4"/></button>
                    </div>
                    <div className="px-6 py-4 space-y-2 max-h-[60vh] overflow-y-auto">
                        {palette.map((p,i)=>(
                            <div key={p.id} className="flex items-center gap-3">
                                <input type="color" value={p.color} onChange={e=>{const np=[...palette];np[i]={...p,color:e.target.value};setPalette(np);}} className="w-8 h-8 rounded-lg border-0 cursor-pointer"/>
                                <input value={p.label} onChange={e=>{const np=[...palette];np[i]={...p,label:e.target.value};setPalette(np);}}
                                    className="flex-1 text-sm px-2 py-1 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-800 dark:text-white outline-none focus:ring-1 focus:ring-[#007D8C]"/>
                                <button onClick={()=>setPalette(palette.filter((_,j)=>j!==i))} className="text-gray-400 hover:text-red-500 transition-colors">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                                </button>
                            </div>
                        ))}
                        <button onClick={()=>setPalette([...palette,{id:`c-${Date.now()}`,label:'New',color:'#007D8C'}])}
                            className="w-full py-2 text-sm text-[#007D8C] border-2 border-dashed border-[#007D8C]/30 rounded-lg hover:bg-[#007D8C]/5 transition-colors">
                            + Add color
                        </button>
                    </div>
                    <div className="px-6 pb-4">
                        <button onClick={()=>setShowPalette(false)} className="w-full py-2 bg-[#007D8C] hover:bg-[#006270] text-white text-sm font-semibold rounded-lg transition-colors">Done</button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

export default CalendarPlanner;
