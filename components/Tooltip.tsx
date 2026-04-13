import React, { createContext, useContext } from 'react';

const TooltipContext = createContext<null>(null);

export const TooltipProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <TooltipContext.Provider value={null}>{children}</TooltipContext.Provider>
);

export const useTooltip = () => useContext(TooltipContext);

export default TooltipProvider;
