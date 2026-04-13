import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from './ThemeContext';

interface MediaInfo {
    active: boolean;
    isPlaying?: boolean;
    title?: string;
    artist?: string;
    album?: string;
    appId?: string;
    thumbnail?: string;
}

// ── Theme palette ──────────────────────────────────────────────────────────────

interface Palette { bg: string; border: string; accent: string; text: string; sub: string; btnPrimary: string; }

function themePalette(dark: boolean): Palette {
    return dark ? {
        bg:         'rgba(17,24,39,0.92)',
        border:     'rgba(0,125,140,0.40)',
        accent:     'rgba(0,210,230,0.85)',
        text:       'rgba(255,255,255,0.95)',
        sub:        'rgba(156,180,190,0.75)',
        btnPrimary: 'rgba(0,125,140,0.85)',
    } : {
        bg:         'rgba(255,255,255,0.96)',
        border:     'rgba(0,125,140,0.30)',
        accent:     'rgba(0,100,115,0.90)',
        text:       'rgba(17,24,39,0.95)',
        sub:        'rgba(75,95,105,0.75)',
        btnPrimary: 'rgba(0,125,140,0.85)',
    };
}

// ── Source app icon mapping ────────────────────────────────────────────────────

function getSourceIcon(appId: string): React.ReactElement {
    const id = (appId || '').toLowerCase();

    if (id.includes('spotify')) return (
        <svg viewBox="0 0 24 24" className="w-full h-full" fill="#1DB954">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
        </svg>
    );

    if (id.includes('chrome') && !id.includes('edge')) return (
        <svg viewBox="0 0 24 24" className="w-full h-full">
            <circle cx="12" cy="12" r="12" fill="#4285F4"/>
            <circle cx="12" cy="12" r="5" fill="white"/>
            <circle cx="12" cy="12" r="3.5" fill="#1A73E8"/>
            <path d="M12 6h10.39A12 12 0 0 0 1.87 7.5L6.93 16A6 6 0 0 1 12 6z" fill="#EA4335"/>
            <path d="M22.39 6H12a6 6 0 0 1 5.07 9l5.06 8.5A12 12 0 0 0 22.39 6z" fill="#FBBC04"/>
            <path d="M17.07 15l-5.06 8.5a12 12 0 0 1-10.14-16L6.93 16a6 6 0 0 0 10.14-1z" fill="#34A853"/>
        </svg>
    );

    if (id.includes('edge') || id.includes('msedge')) return (
        <svg viewBox="0 0 24 24" className="w-full h-full" fill="#0078D4">
            <path d="M21.86 17.86c-.35.19-.72.35-1.1.49A9 9 0 0 1 12 19a9 9 0 0 1-9-9 9 9 0 0 1 .24-2.07C4.11 5.44 6.83 4 9.82 4c4.56 0 7.71 3.12 7.71 6.5 0 2.14-1.33 3.5-3 3.5-1.13 0-1.6-.62-1.6-1.13 0-.12.02-.24.05-.36C13.52 11.1 14 9.76 14 8.5c0-2.5-2-4-4-4C7.12 4.5 5 7.28 5 10.5c0 4.42 3.58 8 8 8a8 8 0 0 0 4.59-1.44c1.38-.94 2.45-2.28 3.08-3.83.07-.17.13-.34.19-.37z"/>
        </svg>
    );

    if (id.includes('firefox')) return (
        <svg viewBox="0 0 24 24" className="w-full h-full">
            <circle cx="12" cy="12" r="12" fill="#FF9500"/>
            <circle cx="12" cy="12" r="7" fill="#FF6000"/>
            <path d="M12 5a7 7 0 0 0-7 7c0 1.86.72 3.55 1.9 4.81 1-2.07 2.87-3.36 4.1-3.81-.8-.5-1-1.5-.5-2.3.5-.8 1.3-1.3 2.5-.7.2.1.3.2.5.3-.1-.9.2-1.8.9-2.3-.3-.3-.6-.5-1-.7A6.96 6.96 0 0 0 12 5z" fill="#FF9500"/>
        </svg>
    );

    if (id.includes('apple') && id.includes('music') || id.includes('itunes') || id.includes('zunemusic') || id.includes('groove')) return (
        <svg viewBox="0 0 24 24" className="w-full h-full">
            <defs>
                <linearGradient id="amusic" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FC5C7D"/>
                    <stop offset="100%" stopColor="#6A82FB"/>
                </linearGradient>
            </defs>
            <rect width="24" height="24" rx="6" fill="url(#amusic)"/>
            <path d="M17 8.5V15a2 2 0 1 1-1.5-1.94V10L10 11v5a2 2 0 1 1-1.5-1.94V9.5L17 8.5z" fill="white"/>
        </svg>
    );

    if (id.includes('tidal')) return (
        <svg viewBox="0 0 24 24" className="w-full h-full" fill="#00FFFF">
            <path d="M12.012 3.992L8.008 7.996 4.004 3.992 0 7.996l4.004 4.004L8.008 8l4.004 4.004 4.004-4.004zM8.008 16.004L12.012 20.008l4.004-4.004-4.004-4.004zM16.012 7.996l4.004 4.004L24.02 7.996l-4.004-4.004z"/>
        </svg>
    );

    if (id.includes('vlc')) return (
        <svg viewBox="0 0 24 24" className="w-full h-full">
            <circle cx="12" cy="12" r="12" fill="#FF8800"/>
            <path d="M8 7l8 5-8 5V7z" fill="white"/>
        </svg>
    );

    // Generic music note fallback
    return (
        <svg viewBox="0 0 24 24" className="w-full h-full" fill="#9CA3AF">
            <path d="M9 3v10.55A4 4 0 1 0 11 17V7h4V3H9z"/>
        </svg>
    );
}

// ── Controls ───────────────────────────────────────────────────────────────────

function sendKey(key: 'playpause' | 'next' | 'prev', onDone?: () => void) {
    // @ts-ignore
    window.electronAPI?.mediaKey?.(key).then(() => {
        // Poll after a short delay to let the player update its window title
        setTimeout(() => onDone?.(), 400);
    });
}

// ── Widget ─────────────────────────────────────────────────────────────────────

const POLL_MS = 3500;

const MediaWidget: React.FC = () => {
    const [info, setInfo]         = useState<MediaInfo>({ active: false });
    const { isDarkMode } = useTheme();
    const palette = themePalette(isDarkMode);
    const [collapsed, setCollapsed] = useState(false);
    const [imgError, setImgError]   = useState(false);
    const [enabled, setEnabled]     = useState(() => localStorage.getItem('xtec_media_player_enabled') !== 'false');
    const [position, setPosition]   = useState(() => localStorage.getItem('xtec_media_player_position') || 'bottom-left');

    useEffect(() => {
        const handler = () => {
            setEnabled(localStorage.getItem('xtec_media_player_enabled') !== 'false');
            setPosition(localStorage.getItem('xtec_media_player_position') || 'bottom-left');
        };
        window.addEventListener('xtec-media-player-changed', handler);
        return () => window.removeEventListener('xtec-media-player-changed', handler);
    }, []);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const [albumArtUrl, setAlbumArtUrl] = useState<string | null>(null);
    const prevTrackKey = useRef('');

    const lastActiveInfo = useRef<MediaInfo | null>(null);

    const poll = useCallback(async () => {
        // @ts-ignore
        if (!window.electronAPI?.getMediaInfo) return;
        try {
            // @ts-ignore
            const result = await window.electronAPI.getMediaInfo();
            if (result?.active && !result?.paused) {
                // Fully playing — update everything
                lastActiveInfo.current = result;
                setInfo(result);
            } else if (result?.paused && lastActiveInfo.current) {
                // Paused — keep last track info, just mark not playing
                setInfo({ ...lastActiveInfo.current, isPlaying: false });
            } else {
                // App closed / nothing running
                lastActiveInfo.current = null;
                setInfo({ active: false });
            }
        } catch {}
    }, []);

    // Fetch album art via main process (no CORS) when track changes
    useEffect(() => {
        if (!info.active || !info.title) { setAlbumArtUrl(null); return; }
        const key = `${info.title}|${info.artist}`;
        if (key === prevTrackKey.current) return;
        prevTrackKey.current = key;
        setAlbumArtUrl(null);
        setImgError(false);
        // @ts-ignore
        const api = window.electronAPI?.getAlbumArt;
        if (!api) return;
        // @ts-ignore
        api(info.title, info.artist ?? '')
            .then((url: string | null) => { if (url) setAlbumArtUrl(url); })
            .catch(() => {});
    }, [info.active, info.title, info.artist]);

    useEffect(() => {
        poll();
        timerRef.current = setInterval(poll, POLL_MS);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [poll]);


    if (!enabled) return null;

    const thumbSrc = albumArtUrl;
    const appIdStr = info.appId ?? '';

    const posClass: Record<string, string> = {
        'bottom-left':  'bottom-4 left-4',
        'bottom-right': 'bottom-4 right-4',
        'top-left':     'top-4 left-4',
        'top-right':    'top-4 right-4',
    };

    return (
        <div
            className={`fixed ${posClass[position] ?? 'bottom-4 left-4'} z-50 select-none`}
            style={{ fontFamily: 'system-ui, sans-serif' }}
        >
            <div
                className="rounded-2xl overflow-hidden transition-all duration-150 backdrop-blur-xl dark:backdrop-blur-none"
                style={isDarkMode ? {
                    width: (collapsed || !info.active) ? 56 : 280,
                    minHeight: 56,
                    background: 'linear-gradient(180deg, rgba(24,28,32,0.92) 0%, rgba(18,22,26,0.95) 100%)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 32px rgba(0,0,0,0.30)',
                } : {
                    width: (collapsed || !info.active) ? 56 : 280,
                    minHeight: 56,
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.75) 0%, rgba(249,250,251,0.82) 100%)',
                    border: '1px solid rgba(0,0,0,0.06)',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
                }}
            >
                {!info.active ? (
                    <div className="w-14 h-14 flex items-center justify-center opacity-30" title="No media playing">
                        <svg viewBox="0 0 24 24" fill="rgba(0,225,240,0.8)" className="w-6 h-6">
                            <path d="M9 3v10.55A4 4 0 1 0 11 17V7h4V3H9z"/>
                        </svg>
                    </div>
                ) : collapsed ? (
                    // ── Collapsed: just album art / icon ────────────────────
                    <button
                        onClick={() => setCollapsed(false)}
                        className="w-14 h-14 flex items-center justify-center rounded-2xl overflow-hidden focus:outline-none"
                        title="Expand now playing"
                    >
                        {thumbSrc && !imgError ? (
                            <img src={thumbSrc} alt="" className="w-full h-full object-cover" onError={() => setImgError(true)} />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center" style={{ background: palette.btnPrimary }}>
                                <div className="w-6 h-6">{getSourceIcon(appIdStr)}</div>
                            </div>
                        )}
                    </button>
                ) : (
                    // ── Expanded card ────────────────────────────────────────
                    <div className="flex items-center gap-3 p-3">
                        {/* Album art + source icon */}
                        <button
                            onClick={() => setCollapsed(true)}
                            className="relative flex-shrink-0 w-11 h-11 rounded-xl overflow-hidden focus:outline-none"
                            title="Minimise"
                        >
                            {thumbSrc && !imgError ? (
                                <img src={thumbSrc} alt="" className="w-full h-full object-cover" onError={() => setImgError(true)} />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center" style={{ background: palette.btnPrimary }}>
                                    <div className="w-6 h-6">{getSourceIcon(appIdStr)}</div>
                                </div>
                            )}
                            {/* Source app icon badge */}
                            {thumbSrc && !imgError && (
                                <div
                                    className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                                    style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
                                >
                                    <div className="w-2.5 h-2.5">{getSourceIcon(appIdStr)}</div>
                                </div>
                            )}
                        </button>

                        {/* Track info */}
                        <div className="flex-1 min-w-0">
                            <p
                                className="text-xs font-semibold leading-tight truncate"
                                style={{ color: palette.text }}
                                title={info.title}
                            >
                                {info.title || 'Unknown'}
                            </p>
                            <p
                                className="text-xs leading-tight truncate mt-0.5"
                                style={{ color: palette.sub }}
                                title={info.artist}
                            >
                                {info.artist || ''}
                            </p>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                            <CtrlBtn title="Previous" onClick={() => sendKey('prev', poll)} btnColor={palette.btnPrimary}>
                                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                    <path d="M6 6h2v12H6V6zm3.5 6 8.5 6V6l-8.5 6z"/>
                                </svg>
                            </CtrlBtn>
                            <CtrlBtn title={info.isPlaying ? 'Pause' : 'Play'} onClick={() => sendKey('playpause', poll)} primary btnColor={palette.btnPrimary}>
                                {info.isPlaying ? (
                                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                                    </svg>
                                ) : (
                                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                        <path d="M8 5v14l11-7z"/>
                                    </svg>
                                )}
                            </CtrlBtn>
                            <CtrlBtn title="Next" onClick={() => sendKey('next', poll)} btnColor={palette.btnPrimary}>
                                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                    <path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5 4V8l-5.5 4zm7.5-6h2v12h-2V6z"/>
                                </svg>
                            </CtrlBtn>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const CtrlBtn: React.FC<{
    onClick: () => void;
    title: string;
    primary?: boolean;
    btnColor?: string;
    children: React.ReactNode;
}> = ({ onClick, title, primary, btnColor, children }) => {
    const base = primary ? (btnColor ?? 'rgba(0,125,140,0.85)') : 'rgba(0,125,140,0.12)';
    const hoverBase = primary ? 'rgba(0,150,168,1)' : 'rgba(0,125,140,0.22)';
    const iconColor = primary ? 'rgba(255,255,255,0.95)' : (btnColor ?? 'rgba(0,125,140,0.9)');
    return (
        <button
            onClick={onClick}
            title={title}
            className="flex items-center justify-center rounded-full transition-all duration-150 focus:outline-none active:scale-90"
            style={{ width: primary ? 32 : 26, height: primary ? 32 : 26, background: base, color: iconColor }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = hoverBase; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = base; }}
        >
            {children}
        </button>
    );
};

export default MediaWidget;
