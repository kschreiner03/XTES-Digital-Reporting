


import React, { useState, useEffect } from 'react';
import LandingPage, { RecentProject } from './components/LandingPage';
import PhotoLog from './components/PhotoLog';
import DfrStandard from './components/DfrStandard';
import DfrSaskpower from './components/DfrSaskpower';
import { retrieveProject } from './components/db';
import CombinedLog from './components/CombinedLog';

export type AppType = 'photoLog' | 'dfrSaskpower' | 'dfrStandard' | 'combinedLog';

const PlaceholderApp: React.FC<{ title: string, onBack: () => void }> = ({ title, onBack }) => (
    <div className="bg-gray-100 min-h-screen flex flex-col justify-center items-center p-4">
        <div className="text-center bg-white p-12 rounded-lg shadow-lg">
            <h1 className="text-3xl font-bold text-gray-800 mb-4">{title}</h1>
            <p className="text-gray-600 mb-8">This feature is currently under construction.</p>
            <button
                onClick={onBack}
                className="bg-[#007D8C] hover:bg-[#006b7a] text-white font-bold py-2 px-4 rounded-lg transition duration-200"
            >
                Back to Home
            </button>
        </div>
    </div>
);

const App: React.FC = () => {
    const [selectedApp, setSelectedApp] = useState<AppType | null>(null);
    const [projectToOpen, setProjectToOpen] = useState<any>(null);
    const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);

    const loadProjectFromFileContent = (content: string, path: string) => {
        try {
            const projectData = JSON.parse(content);
            const ext = path.split('.').pop();
            let type: AppType | null = null;

            if (ext === 'plog') type = 'photoLog';
            else if (ext === 'dfr') type = 'dfrStandard';
            else if (ext === 'spdfr') type = 'dfrSaskpower';
            else if (ext === 'clog') type = 'combinedLog';

            if (type) {
                setProjectToOpen(projectData);
                setSelectedApp(type);
            } else {
                alert('Could not determine project type from file extension.');
            }
        } catch (e) {
            console.error("Failed to parse project data:", e);
            alert("Could not open the project. The file may be corrupt.");
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

        return () => {
             // @ts-ignore
            if (window.electronAPI?.removeUpdateAvailableListener) {
                // @ts-ignore
                window.electronAPI.removeUpdateAvailableListener();
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

    if (!selectedApp) {
        return <LandingPage onSelectApp={handleSelectApp} onOpenProject={handleOpenProject} isUpdateAvailable={isUpdateAvailable} />;
    }

    switch (selectedApp) {
        case 'photoLog':
            return <PhotoLog onBack={handleBackToHome} initialData={projectToOpen} />;
        case 'dfrSaskpower':
            return <DfrSaskpower onBack={handleBackToHome} initialData={projectToOpen} />;
        case 'dfrStandard':
            return <DfrStandard onBack={handleBackToHome} initialData={projectToOpen} />;
        case 'combinedLog':
            return <CombinedLog onBack={handleBackToHome} initialData={projectToOpen} />;
        default:
            return <LandingPage onSelectApp={handleSelectApp} onOpenProject={handleOpenProject} isUpdateAvailable={isUpdateAvailable}/>;
    }
};

export default App;