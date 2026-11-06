/**
 * @vitest-environment jsdom
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PanelLayoutIcon } from './PanelLayoutIcon';

describe('PanelLayoutIcon', () => {
  it('renders left panel schematic icon in open and closed states with distinguishable fill opacity', () => {
    const { container: closedContainer } = render(
      <PanelLayoutIcon position="left" isOpen={false} />
    );
    // Closed state: left region path has subtle tint (fill-opacity 0.3)
    const closedPath = closedContainer.querySelector('path');
    expect(closedPath).toBeDefined();
    expect(closedPath?.getAttribute('fill-opacity')).toBe('0.3');
    expect(closedContainer.querySelectorAll('rect').length).toBe(1);
    expect(closedContainer.querySelectorAll('line').length).toBe(2);

    const { container: openContainer } = render(
      <PanelLayoutIcon position="left" isOpen={true} />
    );
    // Open state: left region path is solidly filled (fill-opacity 1)
    const openPath = openContainer.querySelector('path');
    expect(openPath).toBeDefined();
    expect(openPath?.getAttribute('fill-opacity')).toBe('1');
  });

  it('renders center panel schematic icon in open and closed states with distinguishable fill opacity', () => {
    const { container: closedContainer } = render(
      <PanelLayoutIcon position="center" isOpen={false} />
    );
    // Closed state: center rect has subtle tint (fill-opacity 0.3)
    const closedRects = closedContainer.querySelectorAll('rect');
    expect(closedRects.length).toBe(2);
    expect(closedRects[1]?.getAttribute('fill-opacity')).toBe('0.3');

    const { container: openContainer } = render(
      <PanelLayoutIcon position="center" isOpen={true} />
    );
    // Open state: center rect is solidly filled (fill-opacity 1)
    const openRects = openContainer.querySelectorAll('rect');
    expect(openRects.length).toBe(2);
    expect(openRects[1]?.getAttribute('fill-opacity')).toBe('1');
  });

  it('renders right panel schematic icon in open and closed states with distinguishable fill opacity', () => {
    const { container: closedContainer } = render(
      <PanelLayoutIcon position="right" isOpen={false} />
    );
    // Closed state: right region path has subtle tint (fill-opacity 0.3)
    const closedPath = closedContainer.querySelector('path');
    expect(closedPath).toBeDefined();
    expect(closedPath?.getAttribute('fill-opacity')).toBe('0.3');

    const { container: openContainer } = render(
      <PanelLayoutIcon position="right" isOpen={true} />
    );
    // Open state: right region path is solidly filled (fill-opacity 1)
    const openPath = openContainer.querySelector('path');
    expect(openPath).toBeDefined();
    expect(openPath?.getAttribute('fill-opacity')).toBe('1');
  });
});

