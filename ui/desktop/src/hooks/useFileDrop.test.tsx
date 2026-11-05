/**
 * @vitest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileDrop, type DroppedFile } from './useFileDrop';

function makeDragEvent(payload: { files?: File[]; plainText?: string; gooseFilePath?: string }): {
  event: React.DragEvent<HTMLDivElement>;
  preventDefault: ReturnType<typeof vi.fn>;
} {
  const files = payload.files ?? [];
  const preventDefault = vi.fn();
  const dataTransfer = {
    files: {
      length: files.length,
      item: (i: number) => files[i],
      ...(Object.fromEntries(files.map((f, i) => [i, f])) as Record<number, File>),
    },
    getData: (type: string) => {
      if (type === 'text/plain') return payload.plainText ?? '';
      if (type === 'goose/file-path') return payload.gooseFilePath ?? '';
      return '';
    },
  };
  return {
    event: { preventDefault, dataTransfer } as unknown as React.DragEvent<HTMLDivElement>,
    preventDefault,
  };
}

describe('useFileDrop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as unknown as { electron: Record<string, unknown> }).electron = {
      ...window.electron,
      getPathForFile: vi.fn((file: File) => `/abs/path/${file.name}`),
    };
  });

  it('attaches dropped files', async () => {
    const { result } = renderHook(() => useFileDrop());
    const { event, preventDefault } = makeDragEvent({
      files: [new File(['hello'], 'notes.txt', { type: 'text/plain' })],
    });

    await act(async () => {
      await result.current.handleDrop(event);
    });

    expect(result.current.droppedFiles.length).toBe(1);
    expect(result.current.droppedFiles[0].path).toBe('/abs/path/notes.txt');
    expect(preventDefault).toHaveBeenCalled();
  });

  it('attaches a dragged absolute file path', async () => {
    const { result } = renderHook(() => useFileDrop());
    const { event, preventDefault } = makeDragEvent({ plainText: '/Users/x/proj/src/main.rs' });

    await act(async () => {
      await result.current.handleDrop(event);
    });

    expect(result.current.droppedFiles.length).toBe(1);
    expect(result.current.droppedFiles[0]).toMatchObject<Partial<DroppedFile>>({
      path: '/Users/x/proj/src/main.rs',
      name: 'main.rs',
    });
    expect(preventDefault).toHaveBeenCalled();
  });

  it('ignores dragged selected text and keeps the default drop behaviour', async () => {
    const { result } = renderHook(() => useFileDrop());
    const { event, preventDefault } = makeDragEvent({ plainText: 'let x = 42' });

    await act(async () => {
      await result.current.handleDrop(event);
    });

    expect(result.current.droppedFiles).toEqual([]);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('ignores relative-looking text that is not an absolute path', async () => {
    const { result } = renderHook(() => useFileDrop());
    const { event } = makeDragEvent({ plainText: 'src/main.rs' });

    await act(async () => {
      await result.current.handleDrop(event);
    });

    expect(result.current.droppedFiles).toEqual([]);
  });

  it('accepts the trusted goose/file-path payload from the file explorer', async () => {
    const { result } = renderHook(() => useFileDrop());
    const { event } = makeDragEvent({
      gooseFilePath: '/Users/x/proj/src/lib.rs',
      plainText: '/Users/x/proj/src/lib.rs',
    });

    await act(async () => {
      await result.current.handleDrop(event);
    });

    expect(result.current.droppedFiles.length).toBe(1);
    expect(result.current.droppedFiles[0].name).toBe('lib.rs');
  });
});
