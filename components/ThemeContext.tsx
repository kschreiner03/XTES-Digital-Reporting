import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'grey' | 'sepia' | 'blue' | 'high-contrast';

interface ThemeContextType {
    isDarkMode: boolean;
    theme: ThemeMode;
    setTheme: (mode: ThemeMode) => void;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [theme, setThemeState] = useState<ThemeMode>(() => {
        const stored = localStorage.getItem('xtec_theme');
        if (stored === 'dark' || stored === 'grey' || stored === 'sepia' || stored === 'blue' || stored === 'high-contrast') return stored as ThemeMode;
        if (stored === 'light') return 'light';
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
        return 'light';
    });

    const isDarkMode = theme === 'dark' || theme === 'grey' || theme === 'sepia' || theme === 'blue' || theme === 'high-contrast';

    useEffect(() => {
        const root = window.document.documentElement;

        root.classList.remove('dark', 'theme-grey', 'theme-sepia', 'theme-blue', 'theme-high-contrast');

        if (theme === 'dark') {
            root.classList.add('dark');
        } else if (theme === 'grey') {
            root.classList.add('dark', 'theme-grey');
        } else if (theme === 'sepia') {
            root.classList.add('dark', 'theme-sepia');
        } else if (theme === 'blue') {
            root.classList.add('dark', 'theme-blue');
        } else if (theme === 'high-contrast') {
            root.classList.add('dark', 'theme-high-contrast');
        }

        localStorage.setItem('xtec_theme', theme);

        if (window.electronAPI?.setThemeSource) {
            window.electronAPI.setThemeSource(isDarkMode ? 'dark' : 'light');
        }
    }, [theme, isDarkMode]);

    const setTheme = (mode: ThemeMode) => setThemeState(mode);

    const toggleTheme = () => {
        setThemeState(prev => prev === 'light' ? 'dark' : 'light');
    };

    return (
        <ThemeContext.Provider value={{ isDarkMode, theme, setTheme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
