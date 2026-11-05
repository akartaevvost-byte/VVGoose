/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileContextMenu } from './FileContextMenu';
import { AppEvents } from '../../constants/events';
import type { WorkspaceFileNode } from '../../types/fileSystem';

describe('FileContextMenu', () => {
  const mockNode: WorkspaceFileNode = {
    name: 'agent.rs',
    path: '/mock/workspace/crates/goose/src/agent.rs',
    relativePath: 'crates/goose/src/agent.rs',
    isDirectory: false,
    isIgnored: false,
  };

  const mockOnClose = vi.fn();
  const mockOnCreateFile = vi.fn();
  const mockOnCreateFolder = vi.fn();
  const mockOnRename = vi.fn();
  const mockOnDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all required context menu items', () => {
    render(
      <FileContextMenu
        x={100}
        y={100}
        node={mockNode}
        onClose={mockOnClose}
        onCreateFile={mockOnCreateFile}
        onCreateFolder={mockOnCreateFolder}
        onRename={mockOnRename}
        onDelete={mockOnDelete}
      />
    );

    expect(screen.getByText('Добавить в контекст диалога')).toBeDefined();
    expect(screen.getByText('Копировать путь')).toBeDefined();
    expect(screen.getByText('Копировать относительный путь')).toBeDefined();
    expect(screen.getByText('Создать файл')).toBeDefined();
    expect(screen.getByText('Создать папку')).toBeDefined();
    expect(screen.getByText('Переименовать...')).toBeDefined();
    expect(screen.getByText('Удалить')).toBeDefined();
  });

  it('dispatches ATTACH_FILE_TO_CHAT event when "Добавить в контекст диалога" is clicked', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    render(
      <FileContextMenu
        x={100}
        y={100}
        node={mockNode}
        onClose={mockOnClose}
        onCreateFile={mockOnCreateFile}
        onCreateFolder={mockOnCreateFolder}
        onRename={mockOnRename}
        onDelete={mockOnDelete}
      />
    );

    fireEvent.click(screen.getByText('Добавить в контекст диалога'));

    expect(dispatchSpy).toHaveBeenCalled();
    const event = dispatchSpy.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe(AppEvents.ATTACH_FILE_TO_CHAT);
    expect(event.detail).toEqual({
      path: mockNode.path,
      name: mockNode.name,
    });
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('copies path and relative path to clipboard', async () => {
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextSpy,
      },
    });

    render(
      <FileContextMenu
        x={100}
        y={100}
        node={mockNode}
        onClose={mockOnClose}
        onCreateFile={mockOnCreateFile}
        onCreateFolder={mockOnCreateFolder}
        onRename={mockOnRename}
        onDelete={mockOnDelete}
      />
    );

    fireEvent.click(screen.getByText('Копировать путь'));
    expect(writeTextSpy).toHaveBeenCalledWith(mockNode.path);
    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('Копировать относительный путь'));
    expect(writeTextSpy).toHaveBeenCalledWith(mockNode.relativePath);
  });

  it('triggers delete callback when "Удалить" is clicked', () => {
    render(
      <FileContextMenu
        x={100}
        y={100}
        node={mockNode}
        onClose={mockOnClose}
        onCreateFile={mockOnCreateFile}
        onCreateFolder={mockOnCreateFolder}
        onRename={mockOnRename}
        onDelete={mockOnDelete}
      />
    );

    fireEvent.click(screen.getByText('Удалить'));
    expect(mockOnDelete).toHaveBeenCalledWith(mockNode);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('closes on Escape key press', () => {
    render(
      <FileContextMenu
        x={100}
        y={100}
        node={mockNode}
        onClose={mockOnClose}
        onCreateFile={mockOnCreateFile}
        onCreateFolder={mockOnCreateFolder}
        onRename={mockOnRename}
        onDelete={mockOnDelete}
      />
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('hides "Переименовать..." and "Удалить" when isRoot={true} in single-root workspace', () => {
    const mockRootNode: WorkspaceFileNode = {
      name: 'workspace',
      path: '/mock/workspace',
      relativePath: '',
      isDirectory: true,
      isIgnored: false,
    };

    render(
      <FileContextMenu
        x={100}
        y={100}
        node={mockRootNode}
        isRoot={true}
        isMultiRoot={false}
        onClose={mockOnClose}
        onCreateFile={mockOnCreateFile}
        onCreateFolder={mockOnCreateFolder}
        onRename={mockOnRename}
        onDelete={mockOnDelete}
      />
    );

    expect(screen.getByText('Создать файл')).toBeDefined();
    expect(screen.getByText('Создать папку')).toBeDefined();
    expect(screen.queryByText('Переименовать...')).toBeNull();
    expect(screen.queryByText('Удалить')).toBeNull();
    expect(screen.queryByText('Убрать папку из рабочей области')).toBeNull();
  });

  it('shows "Убрать папку из рабочей области" and hides "Переименовать..." when isRoot={true} in multi-root workspace', () => {
    const mockRootNode: WorkspaceFileNode = {
      name: 'backend',
      path: '/mock/workspace/backend',
      relativePath: '',
      isDirectory: true,
      isIgnored: false,
    };

    render(
      <FileContextMenu
        x={100}
        y={100}
        node={mockRootNode}
        isRoot={true}
        isMultiRoot={true}
        onClose={mockOnClose}
        onCreateFile={mockOnCreateFile}
        onCreateFolder={mockOnCreateFolder}
        onRename={mockOnRename}
        onDelete={mockOnDelete}
      />
    );

    expect(screen.queryByText('Переименовать...')).toBeNull();
    expect(screen.queryByText('Удалить')).toBeNull();
    expect(screen.getByText('Убрать папку из рабочей области')).toBeDefined();

    fireEvent.click(screen.getByText('Убрать папку из рабочей области'));
    expect(mockOnDelete).toHaveBeenCalledWith(mockRootNode);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('detects root node automatically when relativePath is empty and isDirectory is true', () => {
    const mockAutoRootNode: WorkspaceFileNode = {
      name: 'workspace',
      path: '/mock/workspace',
      relativePath: '',
      isDirectory: true,
      isIgnored: false,
    };

    render(
      <FileContextMenu
        x={100}
        y={100}
        node={mockAutoRootNode}
        isMultiRoot={false}
        onClose={mockOnClose}
        onCreateFile={mockOnCreateFile}
        onCreateFolder={mockOnCreateFolder}
        onRename={mockOnRename}
        onDelete={mockOnDelete}
      />
    );

    expect(screen.queryByText('Переименовать...')).toBeNull();
    expect(screen.queryByText('Удалить')).toBeNull();
  });

  it('calls onRemoveFromWorkspace when provided for multi-root root folder', () => {
    const mockRootNode: WorkspaceFileNode = {
      name: 'backend',
      path: '/mock/workspace/backend',
      relativePath: '',
      isDirectory: true,
      isIgnored: false,
    };
    const mockOnRemoveFromWorkspace = vi.fn();

    render(
      <FileContextMenu
        x={100}
        y={100}
        node={mockRootNode}
        isRoot={true}
        isMultiRoot={true}
        onClose={mockOnClose}
        onCreateFile={mockOnCreateFile}
        onCreateFolder={mockOnCreateFolder}
        onRename={mockOnRename}
        onDelete={mockOnDelete}
        onRemoveFromWorkspace={mockOnRemoveFromWorkspace}
      />
    );

    fireEvent.click(screen.getByText('Убрать папку из рабочей области'));
    expect(mockOnRemoveFromWorkspace).toHaveBeenCalledWith(mockRootNode);
    expect(mockOnDelete).not.toHaveBeenCalled();
    expect(mockOnClose).toHaveBeenCalled();
  });
});
