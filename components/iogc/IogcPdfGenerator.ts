import type { IogcLeaseAuditData } from '../../types';

export const generateIogcPdf = async (
    data: IogcLeaseAuditData,
    onStatus?: (msg: string) => void
): Promise<{ blob: Blob; filename: string }> => {
    onStatus?.('Generating PDF...');

    const api = window.electronAPI;
    if (!api?.generateIogcPdf) {
        throw new Error('PDF generation not available');
    }

    const result = await api.generateIogcPdf(data);

    if (!result.success) {
        throw new Error(result.error || 'PDF generation failed');
    }

    if (!result.buffer || !result.filename) {
        throw new Error('PDF generation returned incomplete data');
    }

    // Convert the Uint8Array buffer from IPC to a Blob
    // Create a new Uint8Array to ensure proper ArrayBuffer typing (not SharedArrayBuffer)
    const bufferData = new Uint8Array(result.buffer);
    const blob = new Blob([bufferData], { type: 'application/pdf' });
    return { blob, filename: result.filename };
};
