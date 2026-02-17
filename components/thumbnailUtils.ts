import { AppType } from '../App';

const THUMB_WIDTH = 200;
const THUMB_HEIGHT = 140;
const THUMB_QUALITY = 0.6;

export interface ThumbnailInput {
    type: AppType;
    projectName: string;
    firstPhotoUrl: string | null;
}

function getShortTypeName(type: AppType): string {
    switch (type) {
        case 'photoLog': return 'PHOTO';
        case 'dfrStandard': return 'DFR';
        case 'dfrSaskpower': return 'SP-DFR';
        case 'combinedLog': return 'COMBINED';
        case 'iogcLeaseAudit': return 'IOGC';
        default: return 'REPORT';
    }
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let truncated = text;
    while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
        truncated = truncated.slice(0, -1);
    }
    return truncated + '...';
}

function drawPlaceholder(ctx: CanvasRenderingContext2D) {
    const gradient = ctx.createLinearGradient(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
    gradient.addColorStop(0, '#E0F2F1');
    gradient.addColorStop(1, '#B2DFDB');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);

    ctx.fillStyle = '#007D8C';
    ctx.font = '36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\u{1F4C4}', THUMB_WIDTH / 2, THUMB_HEIGHT / 2 - 10);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
}

function drawOverlay(ctx: CanvasRenderingContext2D, input: ThumbnailInput) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, THUMB_HEIGHT - 36, THUMB_WIDTH, 36);

    const typeLabel = getShortTypeName(input.type);
    ctx.font = 'bold 9px Calibri, Arial, sans-serif';
    const badgeWidth = ctx.measureText(typeLabel).width + 8;
    ctx.fillStyle = '#007D8C';
    ctx.fillRect(6, THUMB_HEIGHT - 30, badgeWidth, 14);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(typeLabel, 10, THUMB_HEIGHT - 20);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '11px Calibri, Arial, sans-serif';
    const truncatedName = truncateText(ctx, input.projectName || 'Untitled', THUMB_WIDTH - 12);
    ctx.fillText(truncatedName, 6, THUMB_HEIGHT - 6);
}

export const generateProjectThumbnail = (input: ThumbnailInput): Promise<string> => {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = THUMB_WIDTH;
        canvas.height = THUMB_HEIGHT;
        const ctx = canvas.getContext('2d')!;

        const finish = () => {
            drawOverlay(ctx, input);
            resolve(canvas.toDataURL('image/jpeg', THUMB_QUALITY));
        };

        if (input.firstPhotoUrl) {
            const img = new Image();
            img.onload = () => {
                const scale = Math.max(THUMB_WIDTH / img.width, THUMB_HEIGHT / img.height);
                const w = img.width * scale;
                const h = img.height * scale;
                ctx.drawImage(img, (THUMB_WIDTH - w) / 2, (THUMB_HEIGHT - h) / 2, w, h);
                finish();
            };
            img.onerror = () => {
                drawPlaceholder(ctx);
                finish();
            };
            img.src = input.firstPhotoUrl;
        } else {
            drawPlaceholder(ctx);
            finish();
        }
    });
};
