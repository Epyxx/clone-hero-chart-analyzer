import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { isDirectoryPickerSupported, scanDirectory, loadEntryFiles, type LibraryEntry } from '../utils/fileSystemAccess';
import { loadCachedLibrary, saveCachedLibrary } from '../utils/libraryCache';

interface Props {
  onFiles: (files: File[]) => void;
}

export function LibraryBrowser({ onFiles }: Props) {
  const { t } = useLanguage();
  const [rootHandle, setRootHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [permissionNeeded, setPermissionNeeded] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const supported = useMemo(isDirectoryPickerSupported, []);

  // Restore a previously picked folder from IndexedDB on first mount, instead of forcing the
  // user to re-pick every visit. Re-using the handle still requires a fresh permission grant
  // (browser security requirement, must be a real click) - but the cached metadata index can be
  // shown immediately once that's confirmed, without re-walking the whole folder tree again.
  useEffect(() => {
    if (!supported) return;
    (async () => {
      const cached = await loadCachedLibrary();
      if (!cached) return;
      setRootHandle(cached.rootHandle);
      const permission = await cached.rootHandle.queryPermission?.({ mode: 'read' });
      if (permission === 'granted') {
        setEntries(cached.entries);
      } else {
        setPermissionNeeded(true);
        setEntries(cached.entries);
      }
    })();
  }, [supported]);

  async function runScan(handle: FileSystemDirectoryHandle) {
    setScanning(true);
    setScanProgress(0);
    setError(null);
    try {
      const found = await scanDirectory(handle, setScanProgress);
      setEntries(found);
      setPermissionNeeded(false);
      await saveCachedLibrary(handle, found);
    } catch {
      setError(t('library.pickError'));
    } finally {
      setScanning(false);
    }
  }

  async function handlePickFolder() {
    try {
      const handle = await window.showDirectoryPicker!({ mode: 'read' });
      setRootHandle(handle);
      await runScan(handle);
    } catch {
      // User cancelled the native picker - not an error worth surfacing.
    }
  }

  async function handleGrantAccess() {
    if (!rootHandle) return;
    const permission = await rootHandle.requestPermission?.({ mode: 'read' });
    if (permission === 'granted') setPermissionNeeded(false);
  }

  async function handleSelectEntry(entry: LibraryEntry) {
    setError(null);
    try {
      const files = await loadEntryFiles(entry);
      onFiles(files);
    } catch {
      setError(t('library.loadError'));
    }
  }

  const filtered = useMemo(() => {
    if (!entries) return [];
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.artist.toLowerCase().includes(q) ||
        e.charter.toLowerCase().includes(q) ||
        e.album.toLowerCase().includes(q),
    );
  }, [entries, search]);

  if (!supported) {
    return <div className="library library--unsupported">{t('library.unsupportedBrowser')}</div>;
  }

  return (
    <div className="library">
      <div className="library__controls">
        <button type="button" className="library__pick-btn" onClick={handlePickFolder} disabled={scanning}>
          📁 {t('library.selectFolder')}
        </button>
        {rootHandle && !permissionNeeded && (
          <button type="button" className="library__rescan-btn" onClick={() => runScan(rootHandle)} disabled={scanning}>
            🔄 {t('library.rescan')}
          </button>
        )}
        {entries && !permissionNeeded && (
          <input
            type="search"
            className="library__search"
            placeholder={t('library.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
      </div>

      {error && <div className="library__error">{error}</div>}

      {permissionNeeded && (
        <div className="library__permission">
          <span>{t('library.grantAccessHint')}</span>
          <button type="button" onClick={handleGrantAccess}>
            🔓 {t('library.grantAccess')}
          </button>
        </div>
      )}

      {scanning && <div className="library__progress">{t('library.scanning', { count: scanProgress })}</div>}

      {!entries && !scanning && !permissionNeeded && <div className="library__empty">{t('library.empty')}</div>}

      {entries && !permissionNeeded && !scanning && (
        <>
          <div className="library__count">{t('library.songsFound', { count: filtered.length })}</div>
          {filtered.length === 0 ? (
            <div className="library__empty">{t('library.noResults')}</div>
          ) : (
            <div className="library__list">
              <table>
                <thead>
                  <tr>
                    <th>{t('library.columnTitle')}</th>
                    <th>{t('library.columnArtist')}</th>
                    <th>{t('library.columnCharter')}</th>
                    <th>{t('library.columnAlbum')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entry) => (
                    <tr key={entry.id} onClick={() => handleSelectEntry(entry)}>
                      <td>{entry.name}</td>
                      <td>{entry.artist}</td>
                      <td>{entry.charter}</td>
                      <td>{entry.album}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
