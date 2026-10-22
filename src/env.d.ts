declare const __COMMIT__: string;

// File System Access save picker (Chrome/Edge), not yet in lib.dom.
interface Window {
  showSaveFilePicker(options?: {
    suggestedName?: string;
    types?: { description?: string; accept: Record<string, string[]> }[];
  }): Promise<FileSystemFileHandle>;
}
