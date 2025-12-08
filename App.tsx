
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import LandingPage, { RecentProject } from './components/LandingPage';
import PhotoLog from './components/PhotoLog';
import DfrStandard from './components/DfrStandard';
import DfrSaskpower from './components/DfrSaskpower';
// import IogcLeaseAudit from './components/IogcLeaseAudit'; // Hidden for now
import { retrieveProject } from './components/db';
import CombinedLog from './components/CombinedLog';
import SettingsModal from './components/SettingsModal';

export type AppType = 'photoLog' | 'dfrSaskpower' | 'dfrStandard' | 'combinedLog' | 'iogcLeaseAudit';

const App: React.FC = () => {
    const [selectedApp, setSelectedApp] = useState<AppType | null>(null);
    const [projectToOpen, setProjectToOpen] = useState<any>(null);
    const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    const loadProjectFromFileContent = (content: string, path: string) => {
        try {
            if (content.trim().startsWith('%PDF')) {
                alert("You are trying to open a PDF file. Please open the editable project file (e.g., .plog, .dfr, .spdfr).");
                return;
            }
            const projectData = JSON.parse(content);
            const ext = path.split('.').pop();
            let type: AppType | null = null;

            if (ext === 'plog') type = 'photoLog';
            else if (ext === 'dfr') type = 'dfrStandard';
            else if (ext === 'spdfr') type = 'dfrSaskpower';
            else if (ext === 'clog') type = 'combinedLog';
            else if (ext === 'iogc') type = 'iogcLeaseAudit';

            if (type) {
                setProjectToOpen(projectData);
                setSelectedApp(type);
            } else {
                alert('Could not determine project type from file extension.');
            }
        } catch (e) {
            console.error("Failed to parse project data:", e);
            alert("Could not open the project. The file may be corrupt or not a valid project file.");
        }
    };

    useEffect(() => {
        // @ts-ignore
        if (window.electronAPI && window.electronAPI.onOpenFile) {
            // @ts-ignore
            window.electronAPI.onOpenFile(async (filePath: string) => {
                // @ts-ignore
                const result = await window.electronAPI.readFile(filePath);
                if (result.success && result.data) {
                    loadProjectFromFileContent(result.data, result.path);
                } else {
                    alert(`Failed to read the file: ${result.error}`);
                }
            });
        }
        
        // @ts-ignore
        if (window.electronAPI?.onUpdateAvailable) {
            // @ts-ignore
            window.electronAPI.onUpdateAvailable(() => {
                setIsUpdateAvailable(true);
            });
        }
        
        // @ts-ignore
        if (window.electronAPI?.onOpenSettings) {
            // @ts-ignore
            window.electronAPI.onOpenSettings(() => {
                setShowSettings(true);
            });
        }

        return () => {
             // @ts-ignore
            if (window.electronAPI?.removeUpdateAvailableListener) {
                // @ts-ignore
                window.electronAPI.removeUpdateAvailableListener();
            }
            // @ts-ignore
             if (window.electronAPI?.removeOpenSettingsListener) {
                // @ts-ignore
                window.electronAPI.removeOpenSettingsListener();
            }
        }
    }, []);

    const handleSelectApp = (app: AppType) => {
        setProjectToOpen(null);
        setSelectedApp(app);
    };

    const handleOpenProject = async (project: RecentProject) => {
        try {
            const projectData = await retrieveProject(project.timestamp);
            if (!projectData) {
                throw new Error("Project data not found in the database.");
            }
            // Pass the timestamp along with the project data so the component knows its own ID
            setProjectToOpen({ ...projectData, timestamp: project.timestamp });
            setSelectedApp(project.type);
        } catch (e) {
            console.error("Failed to load project data:", e);
            alert("Could not open the project. The file may be corrupt or missing from the database.");
        }
    };
    
    const handleBackToHome = () => {
        setSelectedApp(null);
        setProjectToOpen(null);
    }

    return (
        <>
            {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
            {!selectedApp ? (
                <LandingPage onSelectApp={handleSelectApp} onOpenProject={handleOpenProject} isUpdateAvailable={isUpdateAvailable} />
            ) : (
                (() => {
                    switch (selectedApp) {
                        case 'photoLog':
                            return <PhotoLog onBack={handleBackToHome} initialData={projectToOpen} />;
                        case 'dfrSaskpower':
                            return <DfrSaskpower onBack={handleBackToHome} initialData={projectToOpen} />;
                        case 'dfrStandard':
                            return <DfrStandard onBack={handleBackToHome} initialData={projectToOpen} />;
                        case 'combinedLog':
                            return <CombinedLog onBack={handleBackToHome} initialData={projectToOpen} />;
                        // case 'iogcLeaseAudit':
                        //     return <IogcLeaseAudit onBack={handleBackToHome} initialData={projectToOpen} />;
                        default:
                            return <LandingPage onSelectApp={handleSelectApp} onOpenProject={handleOpenProject} isUpdateAvailable={isUpdateAvailable}/>;
                    }
                })()
            )}
        </>
    );
};

export default App;
