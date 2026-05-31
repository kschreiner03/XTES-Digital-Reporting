import React from 'react';

interface ActionStatusModalProps {
  message: string;
}

const ActionStatusModal: React.FC<ActionStatusModalProps> = ({ message }) => {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-[#007D8C]/20 p-6 rounded-xl shadow-2xl text-center max-w-sm w-full mx-4">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">{message}</p>
        <div className="w-full bg-gray-200 dark:bg-white/10 rounded-full h-1.5 overflow-hidden">
          <div className="bg-[#007D8C] h-1.5 rounded-full animate-progress-indeterminate"></div>
        </div>
      </div>
    </div>
  );
};

export default ActionStatusModal;
