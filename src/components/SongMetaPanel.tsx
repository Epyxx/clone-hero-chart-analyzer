import type { ParsedChart } from '../model/chart';
import type { SongIni } from '../parsers/songIni';
import type { ChartStats } from '../model/stats';
import { formatDuration } from '../model/stats';
import { useLanguage } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n/translations';

interface Props {
  chart: ParsedChart;
  ini: SongIni | null;
  albumArtUrl: string | null;
  stats: ChartStats;
}

const DIFF_KEYS: Record<string, TranslationKey> = {
  diff_band: 'diffLabel.diff_band',
  diff_guitar: 'diffLabel.diff_guitar',
  diff_bass: 'diffLabel.diff_bass',
  diff_rhythm: 'diffLabel.diff_rhythm',
  diff_guitar_coop: 'diffLabel.diff_guitar_coop',
  diff_drums: 'diffLabel.diff_drums',
  diff_drums_real: 'diffLabel.diff_drums_real',
  diff_keys: 'diffLabel.diff_keys',
  diff_vocals: 'diffLabel.diff_vocals',
  diff_vocals_harm: 'diffLabel.diff_vocals_harm',
  diff_guitarghl: 'diffLabel.diff_guitarghl',
  diff_bassghl: 'diffLabel.diff_bassghl',
};

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="meta-field">
      <span className="meta-field__label">{label}</span>
      <span className="meta-field__value">{value}</span>
    </div>
  );
}

export function SongMetaPanel({ chart, ini, albumArtUrl, stats }: Props) {
  const { t } = useLanguage();
  const title = ini?.name ?? chart.name ?? t('songMeta.unknownTitle');
  const artist = ini?.artist ?? chart.artist;
  const charter = ini?.charter ?? chart.charter;
  const lengthSeconds = ini?.songLengthMs ? ini.songLengthMs / 1000 : stats.lengthSeconds;
  const bpmLabel = stats.bpmMin === stats.bpmMax ? `${Math.round(stats.bpmMin)}` : `${Math.round(stats.bpmMin)}–${Math.round(stats.bpmMax)}`;

  const diffEntries = ini ? Object.entries(ini.difficulties).filter(([, v]) => v >= 0) : [];

  return (
    <div className="song-meta">
      <div className="song-meta__main">
        {albumArtUrl && <img className="song-meta__art" src={albumArtUrl} alt={t('songMeta.albumArtAlt')} />}
        <div className="song-meta__text">
          <div className="song-meta__title">
            {title}
            {artist && <span className="song-meta__artist"> — {artist}</span>}
          </div>
          <div className="meta-grid">
            <Field label={t('field.album')} value={ini?.album ?? chart.album} />
            <Field label={t('field.genre')} value={ini?.genre ?? chart.genre} />
            <Field label={t('field.year')} value={ini?.year ?? chart.year} />
            <Field label={t('field.charter')} value={charter} />
            <Field label={t('field.length')} value={formatDuration(lengthSeconds)} />
            <Field label={t('field.bpm')} value={bpmLabel} />
            <Field label={t('field.timeSignature')} value={stats.timeSignatures.join(', ')} />
            <Field label={t('field.format')} value={chart.formatSource === 'chart' ? '.chart' : '.mid'} />
            <Field label={t('field.resolution')} value={t('songMeta.ticksPerBeat', { res: chart.resolution })} />
          </div>
          {diffEntries.length > 0 && (
            <div className="diff-badges">
              {diffEntries.map(([key, value]) => (
                <span key={key} className="diff-badge">
                  {DIFF_KEYS[key] ? t(DIFF_KEYS[key]) : key.replace('diff_', '')}
                  <b>{value}</b>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {!ini && (
        <p className="song-meta__hint">{chart.formatSource === 'mid' ? t('songMeta.hintMid') : t('songMeta.hintChart')}</p>
      )}
    </div>
  );
}
