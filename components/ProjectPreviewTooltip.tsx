import React from 'react';

interface ProjectPreviewTooltipProps {
    thumbnailUrl: string | null;
    visible: boolean;
}

const ProjectPreviewTooltip: React.FC<ProjectPreviewTooltipProps> = ({ thumbnailUrl, visible }) => {
    if (!visible) return null;

    return (
        <div
            className="absolute left-0 bottom-full mb-2 z-50 pointer-events-none
                       bg-white dark:bg-gray-700 rounded-lg shadow-xl border
                       border-gray-200 dark:border-gray-600 overflow-hidden"
            style={{ width: 220 }}
        >
            {thumbnailUrl ? (
                <img
                    src={thumbnailUrl}
                    alt="Project preview"
                    className="w-full h-auto"
                    draggable={false}
                />
            ) : (
                <div className="w-full h-[140px] bg-gradient-to-br from-teal-50 to-teal-100
                                dark:from-gray-600 dark:to-gray-700 flex items-center
                                justify-center text-gray-400 dark:text-gray-500">
                    <span className="text-sm">No preview available</span>
                </div>
            )}
        </div>
    );
};

export default ProjectPreviewTooltip;
