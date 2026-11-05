import React from 'react';
import { Folder, FolderOpen, FileCode, FileText, Package, File } from 'lucide-react';

export function getFileIcon(
  filename: string,
  isDirectory = false,
  isExpanded = false
): React.ReactNode {
  if (isDirectory) {
    return isExpanded ? (
      <FolderOpen className="w-4 h-4 text-goose-teal flex-shrink-0" />
    ) : (
      <Folder className="w-4 h-4 text-goose-teal flex-shrink-0" />
    );
  }

  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'rs':
      return <span className="text-xs mr-0.5">🦀</span>;
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'py':
      return <FileCode className="w-4 h-4 text-blue-400 flex-shrink-0" />;
    case 'md':
    case 'txt':
    case 'doc':
      return <FileText className="w-4 h-4 text-neutral-300 flex-shrink-0" />;
    case 'toml':
    case 'json':
    case 'yaml':
    case 'yml':
    case 'lock':
      return <Package className="w-4 h-4 text-yellow-400 flex-shrink-0" />;
    default:
      return <File className="w-4 h-4 text-text-secondary flex-shrink-0" />;
  }
}
