const en = {
  'app.subtitle':
    'Upload a .chart or .mid file, calculate the theoretical maximum score, and see the optimal Star Power path visualized.',

  'error.zipRead': 'Could not read ZIP: {{message}}',
  'error.zipReadGeneric': 'Could not read ZIP.',
  'error.noChartFile': 'No .chart or .mid file found (also not inside the ZIP).',
  'error.noGuitarTrack': 'No 5-fret guitar/bass track found in this file.',
  'error.parseFailedGeneric': 'File could not be read.',

  'dropzone.switchHint': 'Click or drag new files here to switch',
  'dropzone.prompt': 'Drag notes.chart, notes.mid, or a song ZIP here',
  'dropzone.hint': 'optionally together with song.ini & album cover · or click to select files',

  'selectors.instrument': 'Instrument',
  'selectors.difficulty': 'Difficulty',

  'instrument.Single': 'Guitar (Lead)',
  'instrument.DoubleGuitar': 'Guitar (Co-op)',
  'instrument.DoubleBass': 'Bass',
  'instrument.DoubleRhythm': 'Rhythm Guitar',
  'instrument.Keyboard': 'Keyboard',
  'instrument.GHLGuitar': 'Guitar (6-Fret)',
  'instrument.GHLBass': 'Bass (6-Fret)',

  'songMeta.unknownTitle': 'Unknown song title',
  'songMeta.albumArtAlt': 'Album Art',
  'songMeta.ticksPerBeat': '{{res}} ticks/beat',
  'songMeta.hintMid':
    "Note: Artist, album, genre, year, charter, and song length aren't stored in the .mid file itself, but in song.ini. Upload it together with notes.mid (select both files at once via drag & drop) to see this info.",
  'songMeta.hintChart':
    'Tip: The .chart file already contains title, artist, album, genre, year, and charter. Additionally upload song.ini to also see official difficulty ratings and the exact song length.',

  'field.album': 'Album',
  'field.genre': 'Genre',
  'field.year': 'Year',
  'field.charter': 'Charter',
  'field.length': 'Length',
  'field.bpm': 'BPM',
  'field.timeSignature': 'Time Signature',
  'field.format': 'Format',
  'field.resolution': 'Resolution',

  'diffLabel.diff_band': 'Band',
  'diffLabel.diff_guitar': 'Guitar',
  'diffLabel.diff_bass': 'Bass',
  'diffLabel.diff_rhythm': 'Rhythm Guitar',
  'diffLabel.diff_guitar_coop': 'Guitar (Co-op)',
  'diffLabel.diff_drums': 'Drums',
  'diffLabel.diff_drums_real': 'Pro Drums',
  'diffLabel.diff_keys': 'Keyboard',
  'diffLabel.diff_vocals': 'Vocals',
  'diffLabel.diff_vocals_harm': 'Vocals (Harmony)',
  'diffLabel.diff_guitarghl': 'Guitar (6-Fret)',
  'diffLabel.diff_bassghl': 'Bass (6-Fret)',

  'scoreSummary.maxHighscore': 'Maximum Highscore',
  'scoreSummary.notesLabel': 'Notes (incl. sustains, no SP)',
  'scoreSummary.starPowerBonus': 'Star Power Bonus',
  'scoreSummary.soloBonus': 'Solo Bonus',
  'scoreSummary.cleanPlayBonus': 'Clean Play Bonus (+2/note)',
  'scoreSummary.totalNotes': 'Total Notes',
  'scoreSummary.spPhrases': 'SP Phrases',
  'scoreSummary.optimalActivations': 'Optimal SP Activations',

  'highwayControls.zoom': 'Zoom',

  'legend.spPhraseActivated': 'SP phrase (activated)',
  'legend.spPhraseUnused': 'SP phrase (unused)',
  'legend.optimalWindow': 'Optimal activation window (8x)',
  'legend.solo': 'Solo',
  'legend.note': 'Note',
  'legend.hopo': 'HOPO',
  'legend.tap': 'Tap',
  'legend.open': 'Open',

  'highway.points': '{{n}} pts',
  'highway.measureShort': 'Measure {{n}}',

  'activationList.heading': 'Optimal Star Power Activations',
  'activationList.number': '#',
  'activationList.startMeasure': 'Start (measure)',
  'activationList.duration': 'Duration',
  'activationList.gaugeUsed': 'Gauge used',
  'activationList.bonusPoints': 'Bonus points',
  'activationList.measuresUnit': 'measures',

  'assumptions.summary': 'Assumptions & Scoring Methodology',

  'leaderboard.viewLink': 'View on Clone Hero Leaderboards ↗',
} satisfies Record<string, string>;

const de = {
  'app.subtitle':
    'Lädt eine .chart- oder .mid-Datei, berechnet den theoretischen Maximal-Score und zeigt den optimalen Star-Power-Pfad visuell an.',

  'error.zipRead': 'ZIP konnte nicht gelesen werden: {{message}}',
  'error.zipReadGeneric': 'ZIP konnte nicht gelesen werden.',
  'error.noChartFile': 'Keine .chart- oder .mid-Datei gefunden (auch nicht im ZIP).',
  'error.noGuitarTrack': 'Keine 5-Fret-Gitarren-/Bass-Spur in dieser Datei gefunden.',
  'error.parseFailedGeneric': 'Datei konnte nicht gelesen werden.',

  'dropzone.switchHint': 'Klicken oder neue Dateien hierher ziehen, um zu wechseln',
  'dropzone.prompt': 'notes.chart, notes.mid oder ein Song-ZIP hierher ziehen',
  'dropzone.hint': 'optional zusammen mit song.ini & Album-Cover · oder klicken, um Dateien auszuwählen',

  'selectors.instrument': 'Instrument',
  'selectors.difficulty': 'Schwierigkeit',

  'instrument.Single': 'Gitarre (Lead)',
  'instrument.DoubleGuitar': 'Gitarre (Co-op)',
  'instrument.DoubleBass': 'Bass',
  'instrument.DoubleRhythm': 'Rhythmus-Gitarre',
  'instrument.Keyboard': 'Keyboard',
  'instrument.GHLGuitar': 'Gitarre (6-Fret)',
  'instrument.GHLBass': 'Bass (6-Fret)',

  'songMeta.unknownTitle': 'Unbekannter Songtitel',
  'songMeta.albumArtAlt': 'Album-Cover',
  'songMeta.ticksPerBeat': '{{res}} Ticks/Beat',
  'songMeta.hintMid':
    'Hinweis: Interpret, Album, Genre, Jahr, Charter und Song-Länge stehen nicht in der .mid-Datei selbst, sondern in der song.ini. Lade sie zusammen mit der notes.mid hoch (beide Dateien gleichzeitig per Drag & Drop auswählen), um diese Infos zu sehen.',
  'songMeta.hintChart':
    'Tipp: Die .chart-Datei enthält bereits Titel, Interpret, Album, Genre, Jahr und Charter. Lade zusätzlich die song.ini hoch, um auch offizielle Schwierigkeitsgrade und die exakte Song-Länge zu sehen.',

  'field.album': 'Album',
  'field.genre': 'Genre',
  'field.year': 'Jahr',
  'field.charter': 'Charter',
  'field.length': 'Länge',
  'field.bpm': 'BPM',
  'field.timeSignature': 'Taktart',
  'field.format': 'Format',
  'field.resolution': 'Resolution',

  'diffLabel.diff_band': 'Band',
  'diffLabel.diff_guitar': 'Gitarre',
  'diffLabel.diff_bass': 'Bass',
  'diffLabel.diff_rhythm': 'Rhythmus-Gitarre',
  'diffLabel.diff_guitar_coop': 'Gitarre (Co-op)',
  'diffLabel.diff_drums': 'Schlagzeug',
  'diffLabel.diff_drums_real': 'Pro-Schlagzeug',
  'diffLabel.diff_keys': 'Keyboard',
  'diffLabel.diff_vocals': 'Gesang',
  'diffLabel.diff_vocals_harm': 'Gesang (Harmonie)',
  'diffLabel.diff_guitarghl': 'Gitarre (6-Fret)',
  'diffLabel.diff_bassghl': 'Bass (6-Fret)',

  'scoreSummary.maxHighscore': 'Maximaler Highscore',
  'scoreSummary.notesLabel': 'Noten (inkl. Sustains, ohne SP)',
  'scoreSummary.starPowerBonus': 'Star-Power-Bonus',
  'scoreSummary.soloBonus': 'Solo-Bonus',
  'scoreSummary.cleanPlayBonus': 'Clean-Play-Bonus (+2/Note)',
  'scoreSummary.totalNotes': 'Noten gesamt',
  'scoreSummary.spPhrases': 'SP-Phrasen',
  'scoreSummary.optimalActivations': 'Optimale SP-Aktivierungen',

  'highwayControls.zoom': 'Zoom',

  'legend.spPhraseActivated': 'SP-Phrase (aktiviert)',
  'legend.spPhraseUnused': 'SP-Phrase (ungenutzt)',
  'legend.optimalWindow': 'Optimales Aktivierungsfenster (8x)',
  'legend.solo': 'Solo',
  'legend.note': 'Note',
  'legend.hopo': 'HOPO',
  'legend.tap': 'Tap',
  'legend.open': 'Open',

  'highway.points': '{{n}} Punkte',
  'highway.measureShort': 'Takt {{n}}',

  'activationList.heading': 'Optimale Star-Power-Aktivierungen',
  'activationList.number': '#',
  'activationList.startMeasure': 'Start (Takt)',
  'activationList.duration': 'Dauer',
  'activationList.gaugeUsed': 'Füllstand genutzt',
  'activationList.bonusPoints': 'Bonuspunkte',
  'activationList.measuresUnit': 'Takte',

  'assumptions.summary': 'Annahmen & Berechnungsgrundlage',

  'leaderboard.viewLink': 'Auf Clone Hero Leaderboards ansehen ↗',
} satisfies Record<keyof typeof en, string>;

export type TranslationKey = keyof typeof en;
export type Lang = 'en' | 'de';

export const translations: Record<Lang, Record<TranslationKey, string>> = { en, de };
