import React from 'react';
import { cn } from '../../utils';

export interface PanelLayoutIconProps {
  position: 'left' | 'center' | 'right';
  isOpen: boolean;
  className?: string;
}

export const PanelLayoutIcon: React.FC<PanelLayoutIconProps> = ({
  position,
  isOpen,
  className,
}) => {
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn('w-4 h-4 pointer-events-none transition-colors', className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Outer Window Box */}
      <rect
        x="1.5"
        y="2.5"
        width="13"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />

      {/* Internal Dividers separating into 3 areas (Left, Center, Right) */}
      <line x1="5.8" y1="2.5" x2="5.8" y2="13.5" stroke="currentColor" strokeWidth="1" />
      <line x1="10.2" y1="2.5" x2="10.2" y2="13.5" stroke="currentColor" strokeWidth="1" />

      {/* Target panel indicator region: solidly filled when open, visibly tinted when closed */}
      {position === 'left' && (
        <path
          d="M 3.5 2.5 L 5.8 2.5 L 5.8 13.5 L 3.5 13.5 A 2 2 0 0 1 1.5 11.5 L 1.5 4.5 A 2 2 0 0 1 3.5 2.5 Z"
          fill="currentColor"
          fillOpacity={isOpen ? 1 : 0.28}
        />
      )}

      {position === 'center' && (
        <rect
          x="5.8"
          y="2.5"
          width="4.4"
          height="11"
          fill="currentColor"
          fillOpacity={isOpen ? 1 : 0.28}
        />
      )}

      {position === 'right' && (
        <path
          d="M 10.2 2.5 L 12.5 2.5 A 2 2 0 0 1 14.5 4.5 L 14.5 11.5 A 2 2 0 0 1 12.5 13.5 L 10.2 13.5 Z"
          fill="currentColor"
          fillOpacity={isOpen ? 1 : 0.28}
        />
      )}
    </svg>
  );
};

