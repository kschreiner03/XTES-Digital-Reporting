import React from 'react';

interface ActionStatusModalProps {
  message: string;
}

const ActionStatusModal: React.FC<ActionStatusModalProps> = ({ message }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-8 rounded-lg shadow-xl text-center max-w-sm w-full">
        <p className="text-lg font-semibold text-gray-700 mb-4">{message}</p>
        <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
          <div className="bg-[#007D8C] h-2.5 rounded-full animate-progress-indeterminate"></div>
        </div>
      </div>
      <style>{`
        @keyframes progress-indeterminate {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-progress-indeterminate {
          animation: progress-indeterminate 1.5s infinite linear;
          width: 50%; /* Adjust width of the moving bar */
        }
      `}</style>
    </div>
  );
};

export default ActionStatusModal;
