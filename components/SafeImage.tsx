
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
                    if (isMounted) console.error("Asset not resolved:", fileName); 
                }
            } else {
                const encoded = fileName.replace(/\\/g, '/').split('/').map(s => encodeURIComponent(s)).join('/');
                if (isMounted) setSrc(`./assets/${encoded}`);
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
    // Encode each path segment to handle spaces/special chars in filenames
    const encoded = fileName.replace(/\\/g, '/').split('/').map(s => encodeURIComponent(s)).join('/');
    return `./assets/${encoded}`;
};

export default SafeImage;