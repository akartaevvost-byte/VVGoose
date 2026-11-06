import React from 'react';
import { cn } from '../../utils';

export const MainPanelLayout: React.FC<{
  children: React.ReactNode;
  removeTopPadding?: boolean;
  backgroundColor?: string;
  className?: string;
}> = ({
  children,
  removeTopPadding = false,
  backgroundColor = 'bg-background-primary',
  className,
}) => {
  return (
    <div className={cn('h-full w-full min-h-0 flex flex-col', className)}>
      {/* Padding top matches the app toolbar drag area height - can be removed for full bleed */}
      <div
        className={`flex flex-col ${backgroundColor} flex-1 min-w-0 h-full min-h-0 ${removeTopPadding ? '' : 'pt-[32px]'}`}
      >
        {children}
      </div>
    </div>
  );
};
