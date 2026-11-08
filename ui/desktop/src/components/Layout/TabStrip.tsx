import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const SCROLL_EDGE_GAP = 1;

function updateScrollEdges(container: HTMLElement): { left: boolean; right: boolean } {
  return {
    left: container.scrollLeft > SCROLL_EDGE_GAP,
    right: container.scrollLeft + container.clientWidth < container.scrollWidth - SCROLL_EDGE_GAP,
  };
}

function scrollTabStrip(container: HTMLElement, direction: -1 | 1) {
  const distance = Math.max(container.clientWidth * 0.8, 120);
  const maxScroll = Math.max(container.scrollWidth - container.clientWidth, 0);
  const next =
    direction > 0
      ? Math.min(container.scrollLeft + distance, maxScroll)
      : Math.max(container.scrollLeft - distance, 0);
  container.scrollLeft = next;
}

interface TabStripProps {
  testId: string;
  previousLabel: string;
  nextLabel: string;
  revealKey: string;
  tabsKey: string;
  children: React.ReactNode;
}

export const TabStrip: React.FC<TabStripProps> = ({
  testId,
  previousLabel,
  nextLabel,
  revealKey,
  tabsKey,
  children,
}) => {
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const measureEdges = useCallback(() => {
    const container = tabsContainerRef.current;
    if (!container) return;
    const edges = updateScrollEdges(container);
    setCanScrollLeft(edges.left);
    setCanScrollRight(edges.right);
  }, []);

  const revealActiveTab = useCallback(() => {
    const container = tabsContainerRef.current;
    if (!container) return;
    const activeTab = container.querySelector<HTMLElement>('[data-tab][data-active="true"]');
    if (activeTab) {
      const left = activeTab.offsetLeft;
      const right = left + activeTab.offsetWidth;
      if (left < container.scrollLeft) {
        container.scrollLeft = left;
      } else if (right > container.scrollLeft + container.clientWidth) {
        container.scrollLeft = right - container.clientWidth;
      }
    }
    measureEdges();
  }, [measureEdges]);

  useLayoutEffect(() => {
    revealActiveTab();
  }, [revealKey, tabsKey, revealActiveTab]);

  useLayoutEffect(() => {
    const container = tabsContainerRef.current;
    if (!container) return;

    measureEdges();
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measureEdges()) : null;
    observer?.observe(container);
    container.addEventListener('scroll', measureEdges);
    return () => {
      observer?.disconnect();
      container.removeEventListener('scroll', measureEdges);
    };
  }, [children, measureEdges]);

  const scrollByDirection = (direction: -1 | 1) => {
    const container = tabsContainerRef.current;
    if (!container) return;
    scrollTabStrip(container, direction);
    const edges = updateScrollEdges(container);
    setCanScrollLeft(edges.left);
    setCanScrollRight(edges.right);
  };

  const showScrollButtons = canScrollLeft || canScrollRight;

  return (
    <div className="no-drag flex items-center h-9 bg-background-secondary/80 border-b border-border-primary select-none">
      {showScrollButtons && (
        <button
          type="button"
          aria-label={previousLabel}
          disabled={!canScrollLeft}
          onClick={() => scrollByDirection(-1)}
          className="no-drag mx-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-secondary hover:bg-background-tertiary hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
      )}
      <div
        ref={tabsContainerRef}
        data-testid={testId}
        className="relative flex min-w-0 flex-1 items-center overflow-x-hidden px-1"
      >
        {children}
      </div>
      {showScrollButtons && (
        <button
          type="button"
          aria-label={nextLabel}
          disabled={!canScrollRight}
          onClick={() => scrollByDirection(1)}
          className="no-drag mx-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-secondary hover:bg-background-tertiary hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
};
