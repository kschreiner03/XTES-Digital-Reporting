import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { CloseIcon } from './icons';

interface DayEntry {
    notes: string;
    tasks: { id: string; text: string; done: boolean }[];
}

type PlannerData = Record<string, DayEntry>; // key: "YYYY-MM-DD"

const STORAGE_KEY = 'xtec_planner_data';

const loadData = (): PlannerData => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
};

const saveData = (data: PlannerData) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
};

const toKey = (y: number, m: number, d: number) =>
    `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

interface ImportMapping { dateCol: string; notesCol: string; taskCol: string; }
interface ImportPreview { columns: string[]; rows: Record<string, string>[]; mapping: ImportMapping; }

// Try to guess which column is the date and which are notes/tasks
const guessMapping = (columns: string[]): ImportMapping => {
    const lower = (s: string) => s.toLowerCase();
    const dateCol = columns.find(c => /date|day|when|scheduled/.test(lower(c))) ?? columns[0] ?? '';
    const notesCol = columns.find(c => /note|activity|description|work|detail|job|project/.test(lower(c))) ?? '';
    const taskCol = columns.find(c => /task|todo|action|item/.test(lower(c))) ?? '';
    return { dateCol, notesCol, taskCol };
};

// Parse a cell value into a YYYY-MM-DD key, returns null if unparseable
const parseDate = (raw: unknown): string | null => {
    if (raw === null || raw === undefined || raw === '') return null;
    // SheetJS serial number
    if (typeof raw === 'number') {
        const d = XLSX.SSF.parse_date_code(raw);
        if (!d) return null;
        return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
    }
    if (typeof raw === 'string') {
        // Try various common formats: MM/DD/YYYY, YYYY-MM-DD, DD-MMM-YYYY, Month D YYYY
        const s = raw.trim();
        const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (iso) return `${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`;
        const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`;
        const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;
        // Try native Date parsing as last resort
        const d = new Date(s);
        if (!isNaN(d.getTime())) {
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        }
    }
    return null;
};

interface CalendarPlannerProps { onClose: () => void; }

const CalendarPlanner: React.FC<CalendarPlannerProps> = ({ onClose }) => {
    const today = new Date();
    const [viewYear, setViewYear] = useState(today.getFullYear());
    const [viewMonth, setViewMonth] = useState(today.getMonth());
    const [selectedKey, setSelectedKey] = useState<string | null>(
        toKey(today.getFullYear(), today.getMonth(), today.getDate())
    );
    const [data, setData] = useState<PlannerData>(loadData);
    const [newTask, setNewTask] = useState('');
    const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
    const [importCount, setImportCount] = useState<number | null>(null);
    const importInputRef = useRef<HTMLInputElement>(null);
    const notesRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => { saveData(data); }, [data]);

    const prevMonth = () => {
        if (viewMonth === 0) { setViewMonth(11); setViewYear(v => v - 1); }
        else setViewMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (viewMonth === 11) { setViewMonth(0); setViewYear(v => v + 1); }
        else setViewMonth(m => m + 1);
    };

    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: (number | null)[] = [
        ...Array(firstDay).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    const entry = selectedKey ? (data[selectedKey] ?? { notes: '', tasks: [] }) : null;

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const wb = XLSX.read(ev.target?.result, { type: 'array', cellDates: false });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
                if (!rows.length) return;
                const columns = Object.keys(rows[0]);
                const mapping = guessMapping(columns);
                setImportPreview({ columns, rows, mapping });
            } catch (err) {
                console.error('Excel parse error:', err);
            }
        };
        reader.readAsArrayBuffer(file);
        e.target.value = '';
    };

    const applyImport = () => {
        if (!importPreview) return;
        const { rows, mapping } = importPreview;
        let count = 0;
        setData(prev => {
            const next = { ...prev };
            for (const row of rows) {
                const key = parseDate(row[mapping.dateCol]);
                if (!key) continue;
                const existing = next[key] ?? { notes: '', tasks: [] };
                const lines: string[] = [];
                if (mapping.notesCol && row[mapping.notesCol]?.trim()) lines.push(row[mapping.notesCol].trim());
                const notes = [existing.notes, ...lines].filter(Boolean).join('\n').trim();
                const tasks = [...existing.tasks];
                if (mapping.taskCol && row[mapping.taskCol]?.trim()) {
                    tasks.push({ id: `xl-${Date.now()}-${count}`, text: row[mapping.taskCol].trim(), done: false });
                }
                next[key] = { notes, tasks };
                count++;
            }
            return next;
        });
        setImportCount(count);
        setImportPreview(null);
        // Navigate to the month of the first imported date if available
        const firstKey = (() => {
            for (const row of rows) { const k = parseDate(row[importPreview.mapping.dateCol]); if (k) return k; }
            return null;
        })();
        if (firstKey) {
            setViewYear(parseInt(firstKey.slice(0,4)));
            setViewMonth(parseInt(firstKey.slice(5,7)) - 1);
        }
    };

    const updateNotes = (notes: string) => {
        if (!selectedKey) return;
        setData(prev => ({
            ...prev,
            [selectedKey]: { ...(prev[selectedKey] ?? { notes: '', tasks: [] }), notes },
        }));
    };

    const addTask = () => {
        if (!selectedKey || !newTask.trim()) return;
        const task = { id: Date.now().toString(), text: newTask.trim(), done: false };
        setData(prev => ({
            ...prev,
            [selectedKey]: {
                ...(prev[selectedKey] ?? { notes: '', tasks: [] }),
                tasks: [...(prev[selectedKey]?.tasks ?? []), task],
            },
        }));
        setNewTask('');
    };

    const toggleTask = (taskId: string) => {
        if (!selectedKey) return;
        setData(prev => ({
            ...prev,
            [selectedKey]: {
                ...prev[selectedKey],
                tasks: prev[selectedKey].tasks.map(t =>
                    t.id === taskId ? { ...t, done: !t.done } : t
                ),
            },
        }));
    };

    const deleteTask = (taskId: string) => {
        if (!selectedKey) return;
        setData(prev => ({
            ...prev,
            [selectedKey]: {
                ...prev[selectedKey],
                tasks: prev[selectedKey].tasks.filter(t => t.id !== taskId),
            },
        }));
    };

    const hasEntry = (day: number) => {
        const key = toKey(viewYear, viewMonth, day);
        const e = data[key];
        return e && (e.notes.trim() || e.tasks.length > 0);
    };

    const isToday = (day: number) =>
        day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();

    const isSelected = (day: number) => selectedKey === toKey(viewYear, viewMonth, day);

    const selectedDisplay = selectedKey
        ? new Date(
            parseInt(selectedKey.slice(0,4)),
            parseInt(selectedKey.slice(5,7)) - 1,
            parseInt(selectedKey.slice(8,10))
          ).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
        : '';

    return (
        <>
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="xtec-modal-enter bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-2xl border border-gray-200 dark:border-[#007D8C]/20 w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-white/5 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[#007D8C]/10 flex items-center justify-center">
                            <svg className="w-5 h-5 text-[#007D8C]" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-gray-800 dark:text-white">Field Planner</h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Notes and tasks by day</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {importCount !== null && (
                            <span className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-lg border border-green-200 dark:border-green-800">
                                ✓ {importCount} days imported
                            </span>
                        )}
                        <button
                            onClick={() => { setImportCount(null); importInputRef.current?.click(); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#007D8C] border border-[#007D8C]/30 hover:bg-[#007D8C]/10 rounded-lg transition-colors"
                            title="Import schedule from Excel"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                            </svg>
                            Import XLS
                        </button>
                        <input ref={importInputRef} type="file" accept=".xls,.xlsx,.csv" onChange={handleFileSelect} className="hidden" />
                        <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                            <CloseIcon className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* Body — calendar + day panel */}
                <div className="flex flex-1 min-h-0 overflow-hidden">

                    {/* Calendar */}
                    <div className="w-72 shrink-0 flex flex-col border-r border-gray-100 dark:border-white/5">
                        {/* Month nav */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/5">
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

                        {/* Day-of-week headers */}
                        <div className="grid grid-cols-7 px-3 py-2">
                            {DOW.map(d => (
                                <div key={d} className="text-center text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">{d}</div>
                            ))}
                        </div>

                        {/* Calendar grid */}
                        <div className="grid grid-cols-7 px-3 pb-4 gap-y-1 flex-1">
                            {cells.map((day, i) => (
                                <div key={i} className="flex justify-center">
                                    {day ? (
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
                                            {hasEntry(day) && !isSelected(day) && (
                                                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#007D8C]" />
                                            )}
                                        </button>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Day panel */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {selectedKey && entry !== null ? (
                            <>
                                {/* Day header */}
                                <div className="px-5 py-3 border-b border-gray-100 dark:border-white/5 shrink-0">
                                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{selectedDisplay}</p>
                                    {isToday(parseInt(selectedKey.slice(8,10))) &&
                                     parseInt(selectedKey.slice(5,7)) - 1 === today.getMonth() &&
                                     parseInt(selectedKey.slice(0,4)) === today.getFullYear() && (
                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#007D8C]">Today</span>
                                    )}
                                </div>

                                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                                    {/* Notes */}
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#007D8C] mb-2">Notes</p>
                                        <textarea
                                            ref={notesRef}
                                            value={entry.notes}
                                            onChange={e => updateNotes(e.target.value)}
                                            placeholder="Add notes for this day..."
                                            rows={4}
                                            className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition resize-none"
                                        />
                                    </div>

                                    {/* Tasks */}
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#007D8C] mb-2">Tasks</p>
                                        <div className="space-y-1.5 mb-3">
                                            {entry.tasks.length === 0 && (
                                                <p className="text-xs text-gray-400 dark:text-gray-600 italic">No tasks yet</p>
                                            )}
                                            {entry.tasks.map(task => (
                                                <div key={task.id} className="flex items-center gap-2 group">
                                                    <button onClick={() => toggleTask(task.id)}
                                                        className={`w-4 h-4 rounded shrink-0 border-2 flex items-center justify-center transition-colors ${
                                                            task.done
                                                                ? 'bg-[#007D8C] border-[#007D8C]'
                                                                : 'border-gray-300 dark:border-white/20 hover:border-[#007D8C]'
                                                        }`}>
                                                        {task.done && (
                                                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                            </svg>
                                                        )}
                                                    </button>
                                                    <span className={`flex-1 text-sm ${task.done ? 'line-through text-gray-400 dark:text-gray-600' : 'text-gray-700 dark:text-gray-200'}`}>
                                                        {task.text}
                                                    </span>
                                                    <button onClick={() => deleteTask(task.id)}
                                                        className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-500 transition-all">
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Add task */}
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={newTask}
                                                onChange={e => setNewTask(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') addTask(); }}
                                                placeholder="Add a task..."
                                                className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition"
                                            />
                                            <button onClick={addTask}
                                                className="px-3 py-1.5 bg-[#007D8C] hover:bg-[#006270] text-white text-sm font-semibold rounded-lg transition-colors">
                                                Add
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex items-center justify-center">
                                <p className="text-sm text-gray-400 dark:text-gray-600">Select a day to view notes</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>

        {/* Column-mapping modal */}
        {importPreview && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
                <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-2xl border border-gray-200 dark:border-[#007D8C]/20 w-full max-w-md overflow-hidden">
                    <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-white/5">
                        <div>
                            <h3 className="text-base font-semibold text-gray-800 dark:text-white">Map Columns</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{importPreview.rows.length} rows found — confirm which columns to use</p>
                        </div>
                        <button onClick={() => setImportPreview(null)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                            <CloseIcon className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="px-6 py-5 space-y-4">
                        {(['dateCol', 'notesCol', 'taskCol'] as const).map(field => {
                            const labels: Record<string, string> = { dateCol: 'Date column *', notesCol: 'Notes / Activity column', taskCol: 'Task column' };
                            return (
                                <div key={field}>
                                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">{labels[field]}</label>
                                    <select
                                        value={importPreview.mapping[field]}
                                        onChange={e => setImportPreview(prev => prev ? { ...prev, mapping: { ...prev.mapping, [field]: e.target.value } } : null)}
                                        className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-transparent text-gray-800 dark:text-white focus:ring-2 focus:ring-[#007D8C]/40 focus:border-[#007D8C] outline-none transition"
                                    >
                                        <option value="">— skip —</option>
                                        {importPreview.columns.map(col => (
                                            <option key={col} value={col}>{col}</option>
                                        ))}
                                    </select>
                                </div>
                            );
                        })}
                        {/* Preview first 3 rows */}
                        {importPreview.mapping.dateCol && (
                            <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 border border-gray-200 dark:border-white/10">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#007D8C] mb-2">Preview (first 3 rows)</p>
                                <div className="space-y-1">
                                    {importPreview.rows.slice(0,3).map((row, i) => {
                                        const key = parseDate(row[importPreview.mapping.dateCol]);
                                        return (
                                            <div key={i} className="text-xs text-gray-600 dark:text-gray-400 flex gap-2">
                                                <span className="font-medium text-gray-800 dark:text-white shrink-0 w-24">{key ?? '(no date)'}</span>
                                                <span className="truncate">{importPreview.mapping.notesCol ? row[importPreview.mapping.notesCol] : ''}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="px-6 pb-5 flex gap-3">
                        <button onClick={() => setImportPreview(null)} className="flex-1 py-2 text-sm font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 text-gray-700 dark:text-white transition-colors">
                            Cancel
                        </button>
                        <button onClick={applyImport} disabled={!importPreview.mapping.dateCol} className="flex-1 py-2 text-sm font-semibold rounded-lg bg-[#007D8C] hover:bg-[#006270] disabled:opacity-50 text-white transition-colors">
                            Import Schedule
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

export default CalendarPlanner;
