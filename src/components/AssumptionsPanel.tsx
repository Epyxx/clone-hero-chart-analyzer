import { useLanguage } from '../i18n/LanguageContext';

function EnglishBody() {
  return (
    <div className="assumptions__body">
      <p>
        The calculated score is the <strong>theoretical maximum score</strong>: 100% Full Combo (no missed notes, no
        overstrums), 100% solo accuracy, and an <strong>optimal Star Power path</strong> including "early whammy"
        (see below). Timing-squeeze techniques beyond that are not simulated.
      </p>
      <ul>
        <li>50 points per note (each note in a chord counts individually).</li>
        <li>
          Sustain notes: not a continuous rate, but discrete "ticks" spaced <code>floor(resolution / 25)</code> chart
          ticks apart (1 point each before the multiplier), for a total of <code>ceil(length / tick spacing)</code>.
          At most resolutions this yields slightly more than the naive "25 points/beat" calculation.
        </li>
        <li>
          Clean play bonus: a flat +2 points per note (a chord counts once - or +2 per fret for a "disjoint" chord,
          see below), <em>unaffected</em> by the multiplier or Star Power.
        </li>
        <li>
          "Disjoint" chords (frets within the same chord with different sustain lengths): each fret is scored for
          sustain individually (not merged into the longest note, and not deduplicated even if two frets happen to
          share the same length).
        </li>
        <li>
          Sustain cutoff (<code>.mid</code> only, configurable via <code>sustain_cutoff_threshold</code> in
          song.ini): very short "sustains" can be DAW export artifacts rather than real hold durations. Since the
          exact default value Clone Hero itself uses can't be confirmed with certainty, no cutoff is applied{' '}
          <em>unless</em> song.ini explicitly specifies one (every sustain length {'>'} 0 counts) - too aggressive an
          assumption here would push the calculated maximum below scores that are actually achievable, which by
          definition must never happen.
        </li>
        <li>
          The multiplier increases every 10 notes hit (1x → 2x → 3x → 4x, already from the 10th/20th/30th note in
          the streak). Since the streak never breaks on a Full Combo, the multiplier stays at 4x permanently from
          the 30th note onward.
        </li>
        <li>Star Power doubles the current multiplier (e.g. 4x → 8x) for the duration of the activation.</li>
        <li>
          A fully hit SP phrase fills the gauge by 25%. Whammy on a sustain note that starts while an SP phrase is
          active additionally fills 1/30 of the gauge per quarter note held - for the note's entire sustain length,
          even past the end of the SP phrase. The whammy fill rate is purely time-based (waggling faster doesn't
          help) - only how long whammy is held continuously matters, and that's exactly what the calculation
          assumes.
        </li>
        <li>
          "Early whammy": an SP sustain note may be hit up to 70ms before its actual timing (within the normal hit
          window) and whammy can start from that point - giving a small head start on the fill. Clamped to no
          earlier than the previous note's tick.
        </li>
        <li>
          Activation is possible from 50% gauge fill. There is only one shared gauge: while active, it continuously
          drains (a full gauge lasts exactly 8 measures), while whammy on an SP sustain note and completing further
          SP phrases keep refilling it at the normal rate (capped at 100%) - this nearly offsets the drain (net
          +1/120 of the gauge per measure while whammying) and can significantly extend an activation when whammy is
          held continuously through long, densely packed sustains. Whatever is refilled during an active phase is
          not available again for the next activation. A new activation is only possible once the previous phase has
          fully ended - the optimizer enforces this (no overlapping activations).
        </li>
        <li>Solo bonus: 100 points per note hit within a solo section (at 100% accuracy).</li>
      </ul>
      <p className="assumptions__caveat">
        These values are verified against actual score gains in Clone Hero (including the exact point count for a
        song's first few notes) as well as against the formulas of the open-source optimizer{' '}
        <a href="https://github.com/GenericMadScientist/CHOpt" target="_blank" rel="noreferrer">
          CHOpt
        </a>
        .
      </p>
      <p className="assumptions__caveat">
        The optimizer can activate Star Power at any note boundary in the chart (not just phrase boundaries) and
        dynamically tests every combination of banking (collecting multiple phrases) and activating to maximize the
        score bonus - subject to the constraint that activations may never overlap. Timing-squeeze techniques beyond
        that are not simulated (e.g. deliberately hitting notes late to shift an SP phrase slightly, or legacy
        GH1/2 compatibility where solo markers are scored as Star Power without modern SP phrases). The calculated
        value is therefore a very tight, provably optimal upper bound within this model - real leaderboard scores
        from top players can come in just under it, but never above.
      </p>
    </div>
  );
}

function GermanBody() {
  return (
    <div className="assumptions__body">
      <p>
        Der berechnete Score ist der <strong>theoretische Maximal-Score</strong>: 100% Full Combo (keine verpassten
        Noten, kein Overstrum), 100% Solo-Genauigkeit, und ein <strong>optimaler Star-Power-Pfad</strong> inklusive
        "Early Whammy" (siehe unten). Nicht simuliert wird darüber hinausgehendes Timing-Squeezing.
      </p>
      <ul>
        <li>50 Punkte pro Note (jede Note eines Akkords zählt einzeln).</li>
        <li>
          Sustain-Noten: keine kontinuierliche Rate, sondern diskrete "Ticks" im Abstand von{' '}
          <code>floor(Resolution / 25)</code> Chart-Ticks (je 1 Punkt vor Multiplikator), Gesamtanzahl{' '}
          <code>ceil(Länge / Tick-Abstand)</code>. Das ergibt bei den meisten Auflösungen etwas mehr als die naive
          "25 Punkte/Beat"-Rechnung.
        </li>
        <li>
          Clean-Play-Bonus: pauschal +2 Punkte pro Note (Akkord zählt einmal - bzw. +2 pro Fret bei einem
          "disjoint" Akkord, siehe unten), <em>nicht</em> durch Multiplikator oder Star Power beeinflusst.
        </li>
        <li>
          "Disjoint"-Akkorde (Frets im selben Akkord mit unterschiedlicher Haltedauer): jeder Fret wird einzeln
          sustain-gewertet (nicht auf die längste Note zusammengefasst, auch nicht dedupliziert, falls zwei Frets
          zufällig dieselbe Länge haben).
        </li>
        <li>
          Sustain-Cutoff (nur <code>.mid</code>, per <code>sustain_cutoff_threshold</code> in der song.ini
          einstellbar): sehr kurze "Sustains" können DAW-Export-Artefakte statt echter Haltedauer sein. Da der
          exakte Standardwert, den Clone Hero selbst verwendet, nicht zweifelsfrei zu belegen ist, wird{' '}
          <em>ohne</em> explizite song.ini-Angabe kein Cutoff angewendet (jede Sustain-Länge {'>'} 0 zählt) - eine
          zu aggressive Annahme hier würde sonst den berechneten Maximal-Score unter real erzielbare Werte drücken,
          was per Definition nicht sein darf.
        </li>
        <li>
          Multiplikator steigt alle 10 getroffenen Noten (1x → 2x → 3x → 4x, bereits ab der 10./20./30. Note im
          Streak). Da bei einem Full Combo der Streak nie abbricht, bleibt der Multiplikator ab der 30. Note
          dauerhaft bei 4x.
        </li>
        <li>Star Power verdoppelt den aktuellen Multiplikator (z. B. 4x → 8x) für die Dauer der Aktivierung.</li>
        <li>
          Eine vollständig getroffene SP-Phrase füllt die Leiste um 25%. Whammy auf einer Sustain-Note, die{' '}
          <em>beginnt</em>, während eine SP-Phrase läuft, füllt zusätzlich 1/30 der Leiste pro gehaltener
          Viertelnote - für die komplette Haltedauer der Note, auch über das Ende der SP-Phrase hinaus. Die
          Whammy-Füllrate ist rein zeitbasiert (schnelleres Wackeln bringt nichts) - es zählt nur, wie lange
          durchgehend gewhammt wird, und genau das nimmt die Berechnung an.
        </li>
        <li>
          "Early Whammy": Eine SP-Sustain-Note darf bis zu 70ms vor ihrem eigentlichen Timing getroffen werden
          (innerhalb des normalen Hit-Fensters) und ab da schon gewhammt werden - das gibt einen kleinen Kopfstart
          auf die Füllung. Begrenzt auf frühestens den Tick der vorherigen Note.
        </li>
        <li>
          Aktivierung ist ab 50% Füllstand möglich. Es gibt nur eine gemeinsame Leiste: Während sie aktiv ist,
          läuft sie kontinuierlich leer (eine volle Leiste in exakt 8 Takten), während Whammy auf einer
          SP-Sustain-Note und das Abschließen weiterer SP-Phrasen weiterhin mit der normalen Rate nachfüllen
          (max. bis 100%) - das gleicht das Leerlaufen fast aus (netto +1/120 der Leiste pro Takt bei Whammy) und
          kann eine Aktivierung bei durchgehendem Whammy über lange, dicht aufeinanderfolgende Sustains deutlich
          verlängern. Was während einer aktiven Phase nachgefüllt wird, steht danach nicht nochmal für die nächste
          Aktivierung zur Verfügung. Eine neue Aktivierung ist erst möglich, sobald die vorherige Phase komplett
          abgelaufen ist - der Optimierer erzwingt das (keine überlappenden Aktivierungen).
        </li>
        <li>Solo-Bonus: 100 Punkte pro getroffener Note in einem Solo-Abschnitt (bei 100% Genauigkeit).</li>
      </ul>
      <p className="assumptions__caveat">
        Diese Werte sind gegen den tatsächlichen Punktezuwachs in Clone Hero verifiziert (u. a. gegen die genaue
        Punktzahl der ersten Noten eines Songs) sowie gegen die Formeln des quelloffenen Optimierers{' '}
        <a href="https://github.com/GenericMadScientist/CHOpt" target="_blank" rel="noreferrer">
          CHOpt
        </a>
        .
      </p>
      <p className="assumptions__caveat">
        Der Optimierer kann Star Power an jeder Notengrenze im Chart aktivieren (nicht nur an Phrasengrenzen) und
        testet dynamisch alle Kombinationen aus Banking (mehrere Phrasen sammeln) und Aktivieren, um den
        Punktebonus zu maximieren - unter der Nebenbedingung, dass Aktivierungen sich nie überlappen dürfen. Nicht
        simuliert wird darüber hinausgehendes Timing-Squeezing (z. B. Noten bewusst spät treffen, um eine SP-Phrase
        minimal zu verschieben, oder alte GH1/2-Kompatibilität, bei der Solo-Marker ohne moderne SP-Phrasen als
        Star Power gewertet werden). Der berechnete Wert ist daher eine sehr enge, nachweislich optimale Obergrenze
        innerhalb dieses Modells — echte Bestenlisten-Scores von Top-Spielern können knapp darunter liegen, aber
        nicht darüber.
      </p>
    </div>
  );
}

export function AssumptionsPanel() {
  const { t, lang } = useLanguage();
  return (
    <details className="assumptions">
      <summary>{t('assumptions.summary')}</summary>
      {lang === 'de' ? <GermanBody /> : <EnglishBody />}
    </details>
  );
}
