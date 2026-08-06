import { parseSongIni } from '../parsers/songIni';

/**
 * TypeScript's bundled DOM lib types the core File System Access API (FileSystemDirectoryHandle,
 * FileSystemFileHandle, async iteration) but not `window.showDirectoryPicker` or the
 * permission-query methods, since those are still Chromium-only extensions rather than a
 * finalized cross-browser standard.
 */
declare global {
  interface Window {
    showDirectoryPicker?(options?: { id?: string; mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
  }
  interface FileSystemHandle {
    queryPermission?(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
    requestPermission?(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  }
}

export function isDirectoryPickerSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

export interface LibraryEntry {
  id: string;
  name: string;
  artist: string;
  charter: string;
  album: string;
  genre: string;
  year: string;
  relativePath: string;
  dirHandle: FileSystemDirectoryHandle;
}

const CHART_FILE_RE = /\.(chart|mid|midi)$/i;
const INI_FILE_RE = /^song\.ini$/i;
const YIELD_EVERY = 25;

async function yieldToUi(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Recursively walks a picked directory tree looking for song folders - any folder containing a
 * `.chart`/`.mid`/`.midi` file counts as one, its `song.ini` (if present) is parsed for the
 * searchable metadata, and recursion stops there (song folders aren't nested). Folders that
 * aren't song folders themselves (e.g. a top-level "Artist" folder, or a flat pack dump) are
 * recursed into, so both common library layouts work. Yields to the event loop periodically so
 * the UI can keep repainting a live progress count across a scan of thousands of folders.
 */
export async function scanDirectory(root: FileSystemDirectoryHandle, onProgress?: (count: number) => void): Promise<LibraryEntry[]> {
  const results: LibraryEntry[] = [];
  let sinceYield = 0;

  async function walk(dir: FileSystemDirectoryHandle, relativePath: string): Promise<void> {
    let hasChart = false;
    let iniHandle: FileSystemFileHandle | null = null;
    const subdirs: [string, FileSystemDirectoryHandle][] = [];

    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === 'file') {
        if (CHART_FILE_RE.test(name)) hasChart = true;
        else if (INI_FILE_RE.test(name)) iniHandle = handle as FileSystemFileHandle;
      } else {
        subdirs.push([name, handle as FileSystemDirectoryHandle]);
      }
    }

    if (hasChart) {
      let ini = null;
      if (iniHandle) {
        try {
          ini = parseSongIni(await (await iniHandle.getFile()).text());
        } catch {
          ini = null;
        }
      }
      const fallbackName = relativePath.split('/').pop() ?? relativePath;
      results.push({
        id: relativePath,
        name: ini?.name ?? fallbackName,
        artist: ini?.artist ?? '',
        charter: ini?.charter ?? '',
        album: ini?.album ?? '',
        genre: ini?.genre ?? '',
        year: ini?.year ?? '',
        relativePath,
        dirHandle: dir,
      });
      onProgress?.(results.length);
      sinceYield++;
      if (sinceYield >= YIELD_EVERY) {
        sinceYield = 0;
        await yieldToUi();
      }
      return;
    }

    for (const [name, sub] of subdirs) {
      await walk(sub, relativePath ? `${relativePath}/${name}` : name);
    }
  }

  await walk(root, '');
  return results;
}

/** Reads every relevant file (chart/mid, ini, cover art) out of a picked song folder as real
 *  `File` objects, ready to feed straight into the app's existing upload-handling pipeline. */
export async function loadEntryFiles(entry: LibraryEntry): Promise<File[]> {
  const files: File[] = [];
  for await (const [name, handle] of entry.dirHandle.entries()) {
    if (handle.kind !== 'file') continue;
    if (CHART_FILE_RE.test(name) || INI_FILE_RE.test(name) || /\.(jpe?g|png)$/i.test(name)) {
      files.push(await (handle as FileSystemFileHandle).getFile());
    }
  }
  return files;
}
