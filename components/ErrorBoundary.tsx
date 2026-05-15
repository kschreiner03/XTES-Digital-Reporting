import React from 'react';

interface State {
    hasError: boolean;
    error?: Error;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        const message = [
            error.message,
            error.stack,
            `Component stack:${info.componentStack}`,
        ].join('\n');
        // @ts-ignore
        window.electronAPI?.logError?.(message);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
                    <div className="text-center p-10 max-w-md">
                        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-2">Something went wrong</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                            {this.state.error?.message}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mb-8">
                            This error has been logged automatically.
                        </p>
                        <div className="flex justify-center gap-3">
                            <button
                                onClick={() => this.setState({ hasError: false, error: undefined })}
                                className="bg-[#007D8C] hover:bg-[#006b7a] text-white font-semibold px-6 py-2 rounded-lg transition-colors"
                            >
                                Try again
                            </button>
                            <button
                                onClick={() => {
                                    // @ts-ignore
                                    window.electronAPI?.openLogFolder?.();
                                }}
                                className="border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-semibold px-6 py-2 rounded-lg transition-colors"
                            >
                                Open Logs
                            </button>
                        </div>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
