import { useMemo, useState } from 'react';
import { unzipSync } from 'fflate';
import './App.css';
import { FileDropzone } from './components/FileDropzone';
import { Selectors } from './components/Selectors';
import { ScoreSummary } from './components/ScoreSummary';
import { SongMetaPanel } from './components/SongMetaPanel';
import { Highway, HIGHWAY_LAYOUT, FRET_LABEL_COLORS } from './components/Highway';
import { DrumHighway, DRUM_HIGHWAY_LAYOUT, DRUM_LANE_COLORS } from './components/DrumHighway';
import { AssumptionsPanel } from './components/AssumptionsPanel';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { LeaderboardLink } from './components/LeaderboardLink';
import { useLanguage } from './i18n/LanguageContext';
import { computeLeaderboardHash, buildLeaderboardUrl } from './leaderboard';
import { parseChartFile } from './parsers/chartParser';
import { parseMidFile } from './parsers/midParser';
import { parseSongIni } from './parsers/songIni';
import type { SongIni } from './parsers/songIni';
import { TimingMap } from './model/timing';
import { computeChartStats } from './model/stats';
import { scoreTrackBase, ScoreRangeIndex, DRUM_POINTS_PER_NOTE, DRUM_CLEAN_PLAY_BONUS_PER_NOTE, DRUM_SOLO_BONUS_PER_NOTE } from './scoring/score';
import { optimizeStarPower } from './scoring/optimizer';
import { drumTrackToDifficultyTrack } from './scoring/drumAdapter';
import type { ParsedChart, DrumDifficultyTrack } from './model/chart';

const DIFF_ORDER = ['Expert', 'Hard', 'Medium', 'Easy'] as const;
const FRET_NAMES = ['Green', 'Red', 'Yellow', 'Blue', 'Orange'];
const DRUM_LANE_NAMES = ['Red', 'Yellow', 'Blue', 'Green'];
const DRUMS_INSTRUMENT_ID = 'Drums';
const DRUMS_PRO_INSTRUMENT_ID = 'ProDrums';

/** Replaces any .zip file in the list with its extracted entries (song folders are unwrapped). */
async function expandZipFiles(files: File[]): Promise<File[]> {
  const result: File[] = [];
  for (const file of files) {
    if (!/\.zip$/i.test(file.name)) {
      result.push(file);
      continue;
    }
    const buffer = new Uint8Array(await file.arrayBuffer());
    const entries = unzipSync(buffer);
    for (const [path, data] of Object.entries(entries)) {
      if (path.endsWith('/') || data.length === 0) continue;
      const baseName = path.split('/').pop() ?? path;
      result.push(new File([data], baseName));
    }
  }
  return result;
}

function App() {
  const { t, locale } = useLanguage();
  const [chart, setChart] = useState<ParsedChart | null>(null);
  const [ini, setIni] = useState<SongIni | null>(null);
  const [albumArtUrl, setAlbumArtUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [instrument, setInstrument] = useState<string>('');
  const [difficulty, setDifficulty] = useState<string>('');
  const [pxPerTick, setPxPerTick] = useState(0.05);

  async function handleFiles(rawFiles: File[]) {
    setError(null);
    let files: File[];
    try {
      files = await expandZipFiles(rawFiles);
    } catch (e) {
      setError(e instanceof Error ? t('error.zipRead', { message: e.message }) : t('error.zipReadGeneric'));
      return;
    }

    const chartFile =
      files.find((f) => /\.chart$/i.test(f.name)) ?? files.find((f) => /\.mid(i)?$/i.test(f.name));
    const iniFile = files.find((f) => /(^|\/)song\.ini$/i.test(f.name) || /\.ini$/i.test(f.name));
    const imageFile = files.find((f) => /^image\//.test(f.type) || /\.(jpe?g|png)$/i.test(f.name));

    if (!chartFile) {
      setError(t('error.noChartFile'));
      return;
    }

    try {
      let parsed: ParsedChart;
      let parsedIni: SongIni | null = null;
      if (iniFile) {
        parsedIni = parseSongIni(await iniFile.text());
      }

      if (/\.mid(i)?$/i.test(chartFile.name)) {
        const buf = await chartFile.arrayBuffer();
        parsed = parseMidFile(buf, {
          starPowerNoteOverride: parsedIni?.multiplierNote,
          sustainCutoffThresholdOverride: parsedIni?.sustainCutoffThreshold,
        });
      } else {
        parsed = parseChartFile(await chartFile.text());
      }
      if (parsed.instruments.length === 0 && !parsed.drums) {
        setError(t('error.noGuitarTrack'));
        return;
      }

      setChart(parsed);
      setIni(parsedIni);
      setAlbumArtUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return imageFile ? URL.createObjectURL(imageFile) : null;
      });
      setFileName(chartFile.name);
      const firstInst = parsed.instruments[0];
      setInstrument(firstInst.instrument);
      const firstDiff = DIFF_ORDER.find((d) => firstInst.difficulties[d]) ?? Object.keys(firstInst.difficulties)[0];
      setDifficulty(firstDiff);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error.parseFailedGeneric'));
    }
  }

  const isDrums = instrument === DRUMS_INSTRUMENT_ID || instrument === DRUMS_PRO_INSTRUMENT_ID;
  const instrumentData = chart?.instruments.find((i) => i.instrument === instrument);
  const guitarTrack = instrumentData?.difficulties[difficulty as keyof typeof instrumentData.difficulties];
  const drumTrack = isDrums ? chart?.drums?.[difficulty as DrumDifficultyTrack['difficulty']] : undefined;

  const track = useMemo(() => {
    if (drumTrack) return drumTrackToDifficultyTrack(drumTrack);
    return guitarTrack;
  }, [drumTrack, guitarTrack]);

  const timing = useMemo(() => (chart ? new TimingMap(chart) : null), [chart]);
  const stats = useMemo(() => (chart && timing ? computeChartStats(chart, timing) : null), [chart, timing]);

  const scored = useMemo(() => {
    if (!track || !chart) return null;
    return scoreTrackBase(
      track,
      chart.resolution,
      isDrums
        ? { pointsPerNote: DRUM_POINTS_PER_NOTE, cleanPlayBonusPerNote: DRUM_CLEAN_PLAY_BONUS_PER_NOTE, soloBonusPerNote: DRUM_SOLO_BONUS_PER_NOTE }
        : {},
    );
  }, [track, chart, isDrums]);

  const result = useMemo(() => {
    if (!track || !scored || !timing || !chart) return null;
    return optimizeStarPower(track, scored, timing, chart.resolution);
  }, [track, scored, timing, chart]);

  const scoreIndex = useMemo(() => (scored ? new ScoreRangeIndex(scored) : null), [scored]);

  const leaderboardHash = useMemo(() => {
    if (!chart || !stats) return null;
    try {
      return computeLeaderboardHash(chart, ini, stats.lengthSeconds);
    } catch {
      return null;
    }
  }, [chart, ini, stats]);

  // The hash identifies the whole song - the URL just needs to point at whichever
  // instrument+difficulty the user currently has selected in the app.
  const leaderboardUrl = useMemo(() => {
    if (!leaderboardHash || !instrument || !difficulty) return null;
    return buildLeaderboardUrl(leaderboardHash, instrument, difficulty);
  }, [leaderboardHash, instrument, difficulty]);

  const availableDifficulties = isDrums
    ? DIFF_ORDER.filter((d) => chart?.drums?.[d])
    : instrumentData
      ? DIFF_ORDER.filter((d) => instrumentData.difficulties[d])
      : [];

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__header-top">
          <h1>Clone Hero Chart Analyzer</h1>
          <LanguageSwitcher />
        </div>
        <p className="app__subtitle">{t('app.subtitle')}</p>
      </header>

      <FileDropzone onFiles={handleFiles} fileName={fileName} error={error} />

      {chart && stats && (
        <>
          <SongMetaPanel chart={chart} ini={ini} albumArtUrl={albumArtUrl} stats={stats} />
          {leaderboardUrl && <LeaderboardLink url={leaderboardUrl} />}

          <Selectors
            instruments={[
              ...chart.instruments.map((i) => i.instrument),
              ...(chart.drums ? [DRUMS_INSTRUMENT_ID, DRUMS_PRO_INSTRUMENT_ID] : []),
            ]}
            difficulties={availableDifficulties}
            instrument={instrument}
            difficulty={difficulty}
            onInstrument={(v) => {
              setInstrument(v);
              if (v === DRUMS_INSTRUMENT_ID || v === DRUMS_PRO_INSTRUMENT_ID) {
                const d = DIFF_ORDER.find((d) => chart.drums?.[d]) ?? Object.keys(chart.drums ?? {})[0];
                if (d) setDifficulty(d);
                return;
              }
              const inst = chart.instruments.find((i) => i.instrument === v);
              const d = inst && (DIFF_ORDER.find((d) => inst.difficulties[d]) ?? Object.keys(inst.difficulties)[0]);
              if (d) setDifficulty(d);
            }}
            onDifficulty={setDifficulty}
          />

          {track && scored && result && scoreIndex && (
            <>
              <ScoreSummary
                scored={scored}
                result={result}
                noteCount={track.notes.length}
                spPhraseCount={track.starPower.length}
              />

              <div className="highway-controls">
                <label>
                  {t('highwayControls.zoom')}
                  <input
                    type="range"
                    min={0.01}
                    max={0.3}
                    step={0.005}
                    value={pxPerTick}
                    onChange={(e) => setPxPerTick(parseFloat(e.target.value))}
                  />
                </label>
                <div className="legend">
                  <span className="legend__item">
                    <i className="legend__swatch" style={{ background: 'rgba(140,110,255,0.35)', borderColor: '#a78bfa' }} />
                    {t('legend.spPhraseActivated')}
                  </span>
                  <span className="legend__item">
                    <i className="legend__swatch" style={{ background: 'rgba(140,110,255,0.15)', borderColor: '#5b4d8f' }} />
                    {t('legend.spPhraseUnused')}
                  </span>
                  <span className="legend__item">
                    <i className="legend__swatch" style={{ background: '#ffc83c' }} />
                    {t('legend.optimalWindow')}
                  </span>
                  <span className="legend__item">
                    <i className="legend__swatch" style={{ background: '#38e0e0' }} />
                    {t('legend.solo')}
                  </span>
                  {isDrums ? (
                    <>
                      <span className="legend__item legend__item--sep">
                        <i className="legend__dot" style={{ background: '#f2d43d' }} />
                        {t('legend.cymbal')}
                      </span>
                      <span className="legend__item">
                        <i className="legend__dot" style={{ background: '#f2d43d', borderRadius: 0 }} />
                        {t('legend.tom')}
                      </span>
                      <span className="legend__item">
                        <i className="legend__dot" style={{ background: '#f2d43d', opacity: 0.5, transform: 'scale(0.75)' }} />
                        {t('legend.ghost')}
                      </span>
                      <span className="legend__item">
                        <i className="legend__dot" style={{ background: '#f2d43d', outline: '1.5px solid #ffe066', outlineOffset: 1 }} />
                        {t('legend.accent')}
                      </span>
                      <span className="legend__item">
                        <i className="legend__swatch legend__swatch--bar" style={{ background: '#f2953d' }} />
                        {t('legend.kick')}
                      </span>
                      <span className="legend__item">
                        <i className="legend__swatch legend__swatch--bar" style={{ background: '#f2953d', outline: '1.5px solid #ffffff', outlineOffset: 1 }} />
                        {t('legend.doubleKick')}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="legend__item legend__item--sep">
                        <i className="legend__dot" style={{ background: '#f2d43d' }} />
                        {t('legend.note')}
                      </span>
                      <span className="legend__item">
                        <i className="legend__dot legend__dot--hopo" style={{ background: '#f2d43d' }} />
                        {t('legend.hopo')}
                      </span>
                      <span className="legend__item">
                        <i className="legend__dot" style={{ background: '#f2d43d', opacity: 0.5 }} />
                        {t('legend.tap')}
                      </span>
                      <span className="legend__item">
                        <i className="legend__swatch legend__swatch--bar" style={{ background: '#b45cf0' }} />
                        {t('legend.open')}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="highway-wrapper">
                <div
                  className="highway-labels"
                  style={{
                    paddingTop: isDrums ? DRUM_HIGHWAY_LAYOUT.TOP_MARGIN : HIGHWAY_LAYOUT.TOP_MARGIN,
                    paddingBottom: isDrums ? DRUM_HIGHWAY_LAYOUT.BOTTOM_MARGIN : HIGHWAY_LAYOUT.BOTTOM_MARGIN,
                  }}
                >
                  {(isDrums ? DRUM_LANE_NAMES : FRET_NAMES).map((name, i) => (
                    <div
                      key={name}
                      className="highway-labels__item"
                      style={{
                        height: isDrums ? DRUM_HIGHWAY_LAYOUT.LANE_HEIGHT : HIGHWAY_LAYOUT.LANE_HEIGHT,
                        marginBottom: isDrums ? DRUM_HIGHWAY_LAYOUT.LANE_GAP : HIGHWAY_LAYOUT.LANE_GAP,
                        color: isDrums ? DRUM_LANE_COLORS[i] : FRET_LABEL_COLORS[i],
                      }}
                    >
                      {name}
                    </div>
                  ))}
                </div>
                <div className="highway-scroll">
                  {isDrums && drumTrack ? (
                    <DrumHighway
                      track={drumTrack}
                      timing={timing!}
                      lastTick={chart.lastTick}
                      activations={result.activations}
                      usedPhraseIndices={result.usedPhraseIndices}
                      scoreIndex={scoreIndex}
                      pxPerTick={pxPerTick}
                    />
                  ) : (
                    <Highway
                      track={track}
                      timing={timing!}
                      resolution={chart.resolution}
                      lastTick={chart.lastTick}
                      activations={result.activations}
                      usedPhraseIndices={result.usedPhraseIndices}
                      scoreIndex={scoreIndex}
                      pxPerTick={pxPerTick}
                    />
                  )}
                </div>
              </div>

              <div className="activation-list">
                <h2>{t('activationList.heading')}</h2>
                <table>
                  <thead>
                    <tr>
                      <th>{t('activationList.number')}</th>
                      <th>{t('activationList.startMeasure')}</th>
                      <th>{t('activationList.duration')}</th>
                      <th>{t('activationList.gaugeUsed')}</th>
                      <th>{t('activationList.bonusPoints')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.activations.map((a, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>{timing ? timing.ticksToMeasures(a.startTick).toFixed(1) : '-'}</td>
                        <td>
                          {a.measures.toFixed(2)} {t('activationList.measuresUnit')}
                        </td>
                        <td>{Math.round((a.gaugeUnitsUsed / 120) * 100)}%</td>
                        <td>+{Math.round(a.bonusPoints).toLocaleString(locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      <AssumptionsPanel />

      <footer className="app__footer">© {new Date().getFullYear()} Epyx</footer>
    </div>
  );
}

export default App;
