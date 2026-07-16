import { useLanguage } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n/translations';

interface Props {
  instruments: string[];
  difficulties: string[];
  instrument: string;
  difficulty: string;
  onInstrument: (v: string) => void;
  onDifficulty: (v: string) => void;
}

const INSTRUMENT_KEYS: Record<string, TranslationKey> = {
  Single: 'instrument.Single',
  DoubleGuitar: 'instrument.DoubleGuitar',
  DoubleBass: 'instrument.DoubleBass',
  DoubleRhythm: 'instrument.DoubleRhythm',
  Keyboard: 'instrument.Keyboard',
  GHLGuitar: 'instrument.GHLGuitar',
  GHLBass: 'instrument.GHLBass',
  Drums: 'instrument.Drums',
  ProDrums: 'instrument.ProDrums',
};

// Difficulty names (Expert/Hard/Medium/Easy) are used as-is by Clone Hero itself, in every language.
const DIFF_LABELS: Record<string, string> = {
  Expert: 'Expert',
  Hard: 'Hard',
  Medium: 'Medium',
  Easy: 'Easy',
};

export function Selectors({ instruments, difficulties, instrument, difficulty, onInstrument, onDifficulty }: Props) {
  const { t } = useLanguage();
  return (
    <div className="selectors">
      <label>
        <span>{t('selectors.instrument')}</span>
        <select value={instrument} onChange={(e) => onInstrument(e.target.value)}>
          {instruments.map((i) => (
            <option key={i} value={i}>
              {INSTRUMENT_KEYS[i] ? t(INSTRUMENT_KEYS[i]) : i}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{t('selectors.difficulty')}</span>
        <select value={difficulty} onChange={(e) => onDifficulty(e.target.value)}>
          {difficulties.map((d) => (
            <option key={d} value={d}>
              {DIFF_LABELS[d] ?? d}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
