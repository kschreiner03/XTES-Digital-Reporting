
import React, { useState, useEffect } from 'react';

interface SafeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    fileName: string;
}

const SafeImage: React.FC<SafeImageProps> = ({ fileName, ...props }) => {
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
                    if (isMounted) setSrc(`./assets/${fileName}`); 
                }
            } else {
                if (isMounted) setSrc(`./assets/${fileName}`);
            }
        };
        loadAsset();
        return () => { isMounted = false; };
    }, [fileName]);

    if (!src) return null;

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

export default SafeImage;
