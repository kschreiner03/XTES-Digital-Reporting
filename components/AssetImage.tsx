import React, { useState, useEffect } from 'react';

interface AssetImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    fileName: string;
}

const AssetImage: React.FC<AssetImageProps> = ({ fileName, ...props }) => {
    const [src, setSrc] = useState<string>('');

    useEffect(() => {
        let isMounted = true;
        const loadAsset = async () => {
            // @ts-ignore
            if (window.electronAPI?.getAssetPath) {
                try {
                    // @ts-ignore
                    const path = await window.electronAPI.getAssetPath(fileName);
                    if (isMounted) setSrc(path);
                } catch (e) {
                    console.error("Failed to resolve asset path:", e);
                    // Fallback for web/dev if API fails (though API is designed for both)
                    if (isMounted) setSrc(`./assets/${fileName}`); 
                }
            } else {
                // Fallback for web browser environment
                if (isMounted) setSrc(`./assets/${fileName}`);
            }
        };
        loadAsset();
        return () => { isMounted = false; };
    }, [fileName]);

    if (!src) return null; // Or a skeleton placeholder

    return <img src={src} {...props} />;
};

export const getAssetUrl = async (fileName: string): Promise<string> => {
    // @ts-ignore
    if (window.electronAPI?.getAssetPath) {
        // @ts-ignore
        return await window.electronAPI.getAssetPath(fileName);
    }
    return `./assets/${fileName}`;
};

export default AssetImage;
