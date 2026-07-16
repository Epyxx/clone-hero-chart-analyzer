import { useLanguage } from '../i18n/LanguageContext';

interface Props {
  url: string;
}

export function LeaderboardLink({ url }: Props) {
  const { t } = useLanguage();
  return (
    <a className="leaderboard-link" href={url} target="_blank" rel="noreferrer">
      {t('leaderboard.viewLink')}
    </a>
  );
}
