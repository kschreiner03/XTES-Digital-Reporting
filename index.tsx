
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ThemeProvider } from './components/ThemeContext';
import ErrorBoundary from './components/ErrorBoundary';

// Forward unhandled renderer errors to the main-process log file
window.onerror = (_msg, _src, _line, _col, err) => {
  // @ts-ignore
  window.electronAPI?.logError?.(`Unhandled error: ${err?.stack || err || _msg}`);
};
window.onunhandledrejection = (e) => {
  // @ts-ignore
  window.electronAPI?.logError?.(`Unhandled rejection: ${e.reason?.stack || e.reason}`);
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ThemeProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </ThemeProvider>
  </React.StrictMode>
);
