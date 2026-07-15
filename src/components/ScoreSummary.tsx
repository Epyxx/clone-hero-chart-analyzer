import type { ScoredTrack } from '../scoring/score';
import type { OptimizationResult } from '../scoring/optimizer';
import { useLanguage } from '../i18n/LanguageContext';

interface Props {
  scored: ScoredTrack;
  result: OptimizationResult;
  noteCount: number;
  spPhraseCount: number;
}

export function ScoreSummary({ scored, result, noteCount, spPhraseCount }: Props) {
  const { t, locale } = useLanguage();
  const fmt = (n: number) => Math.round(n).toLocaleString(locale);

  return (
    <div className="score-summary">
      <div className="score-summary__total">
        <span className="label">{t('scoreSummary.maxHighscore')}</span>
        <span className="value">{fmt(result.totalScore)}</span>
      </div>
      <div className="score-summary__grid">
        <div>
          <span className="label">{t('scoreSummary.notesLabel')}</span>
          <span className="value">{fmt(scored.baseScoreNoStarPower)}</span>
        </div>
        <div>
          <span className="label">{t('scoreSummary.starPowerBonus')}</span>
          <span className="value">+{fmt(result.starPowerBonus)}</span>
        </div>
        <div>
          <span className="label">{t('scoreSummary.soloBonus')}</span>
          <span className="value">+{fmt(scored.soloBonus)}</span>
        </div>
        <div>
          <span className="label">{t('scoreSummary.cleanPlayBonus')}</span>
          <span className="value">+{fmt(scored.cleanPlayBonus)}</span>
        </div>
        <div>
          <span className="label">{t('scoreSummary.totalNotes')}</span>
          <span className="value">{noteCount}</span>
        </div>
        <div>
          <span className="label">{t('scoreSummary.spPhrases')}</span>
          <span className="value">{spPhraseCount}</span>
        </div>
        <div>
          <span className="label">{t('scoreSummary.optimalActivations')}</span>
          <span className="value">{result.activations.length}</span>
        </div>
      </div>
    </div>
  );
}
