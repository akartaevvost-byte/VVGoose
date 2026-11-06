/**
 * @vitest-environment jsdom
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PanelLayoutIcon } from './PanelLayoutIcon';

describe('PanelLayoutIcon', () => {
  it('renders left panel schematic icon in open and closed states', () => {
    const { container: closedContainer } = render(
      <PanelLayoutIcon position="left" isOpen={false} />
    );
    // Closed state: only outline rect and divider lines, no filled path
    expect(closedContainer.querySelectorAll('path').length).toBe(0);
    expect(closedContainer.querySelectorAll('rect').length).toBe(1);
    expect(closedContainer.querySelectorAll('line').length).toBe(2);

    const { container: openContainer } = render(
      <PanelLayoutIcon position="left" isOpen={true} />
    );
    // Open state: left region path is filled
    expect(openContainer.querySelectorAll('path').length).toBe(1);
  });

  it('renders center panel schematic icon in open and closed states', () => {
    const { container: closedContainer } = render(
      <PanelLayoutIcon position="center" isOpen={false} />
    );
    expect(closedContainer.querySelectorAll('rect').length).toBe(1);

    const { container: openContainer } = render(
      <PanelLayoutIcon position="center" isOpen={true} />
    );
    // Open state: inner center rect is rendered (total 2 rects)
    expect(openContainer.querySelectorAll('rect').length).toBe(2);
  });

  it('renders right panel schematic icon in open and closed states', () => {
    const { container: closedContainer } = render(
      <PanelLayoutIcon position="right" isOpen={false} />
    );
    expect(closedContainer.querySelectorAll('path').length).toBe(0);

    const { container: openContainer } = render(
      <PanelLayoutIcon position="right" isOpen={true} />
    );
    // Open state: right region path is filled
    expect(openContainer.querySelectorAll('path').length).toBe(1);
  });
});

