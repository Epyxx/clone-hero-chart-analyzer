import { useLanguage } from '../i18n/LanguageContext';

export function LanguageSwitcher() {
  const { lang, setLang } = useLanguage();

  return (
    <div className="lang-switch" role="group" aria-label="Language">
      <button
        type="button"
        className={`lang-switch__btn ${lang === 'en' ? 'lang-switch__btn--active' : ''}`}
        onClick={() => setLang('en')}
        aria-pressed={lang === 'en'}
        title="English"
      >
        <span aria-hidden="true">🇬🇧</span> EN
      </button>
      <button
        type="button"
        className={`lang-switch__btn ${lang === 'de' ? 'lang-switch__btn--active' : ''}`}
        onClick={() => setLang('de')}
        aria-pressed={lang === 'de'}
        title="Deutsch"
      >
        <span aria-hidden="true">🇩🇪</span> DE
      </button>
    </div>
  );
}
