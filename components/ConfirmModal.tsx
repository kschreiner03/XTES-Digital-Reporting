import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'motion/react';

interface ConfirmModalProps {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    destructive = false,
    onConfirm,
    onCancel,
}) => (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onCancel(); }}>
        <Dialog.Portal>
            <Dialog.Overlay asChild>
                <motion.div
                    className="fixed inset-0 z-[500] bg-black/50 backdrop-blur-sm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                />
            </Dialog.Overlay>
            <div className="fixed inset-0 z-[500] flex items-center justify-center pointer-events-none">
                <Dialog.Content asChild>
                    <motion.div
                        className="relative rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 pointer-events-auto bg-white dark:bg-gray-900 border border-black/[0.08] dark:border-white/[0.08]"
                        initial={{ opacity: 0, scale: 0.97, y: 6 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: 4 }}
                        transition={{ duration: 0.16, ease: 'easeOut' }}
                    >
                        <Dialog.Title className="text-base font-semibold text-gray-900 dark:text-white mb-2">
                            {title}
                        </Dialog.Title>
                        <Dialog.Description className="text-sm text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                            {message}
                        </Dialog.Description>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={onCancel}
                                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                {cancelLabel}
                            </button>
                            <button
                                onClick={onConfirm}
                                className={`px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors ${
                                    destructive
                                        ? 'bg-red-500 hover:bg-red-600'
                                        : 'bg-[#007D8C] hover:bg-[#006b7a]'
                                }`}
                            >
                                {confirmLabel}
                            </button>
                        </div>
                    </motion.div>
                </Dialog.Content>
            </div>
        </Dialog.Portal>
    </Dialog.Root>
);

export default ConfirmModal;
