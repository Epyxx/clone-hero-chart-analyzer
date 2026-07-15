import { useCallback, useRef, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

interface Props {
  onFiles: (files: File[]) => void;
  fileName?: string;
  error?: string | null;
}

export function FileDropzone({ onFiles, fileName, error }: Props) {
  const { t } = useLanguage();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      onFiles(Array.from(files));
    },
    [onFiles],
  );

  return (
    <div
      className={`dropzone ${dragging ? 'dropzone--active' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".chart,.mid,.midi,.ini,.zip,image/*"
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="dropzone__icon">🎸</div>
      <div className="dropzone__text">
        {fileName ? (
          <>
            <strong>{fileName}</strong>
            <span>{t('dropzone.switchHint')}</span>
          </>
        ) : (
          <>
            <strong>{t('dropzone.prompt')}</strong>
            <span>{t('dropzone.hint')}</span>
          </>
        )}
      </div>
      {error && <div className="dropzone__error">{error}</div>}
    </div>
  );
}
