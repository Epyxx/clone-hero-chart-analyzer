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
      <p className="assumptions__caveat">
        <strong>Drums scoring is a best-effort estimate, not verified against real gameplay</strong> (everything
        above this line is). It reuses the same combo/multiplier/Star Power engine as guitar - each drum hit is
        worth <strong>50 points</strong>, the same as a guitar note. (An earlier version of this app assumed 25 -
        half of guitar's value, an older convention from this game genre - but a real #1 leaderboard score for a
        Pro Drums chart came in <em>higher</em> than that estimate, which can never happen for a true maximum, so
        the assumption was revised.) A double-kick hit (both pedals at once) counts as two simultaneous kick hits
        for scoring, same as a chord - unverified, but this is what makes the calculated max land just above that
        real score rather than below it. No clean-play bonus (a guitar/bass strum-accuracy mechanic with no drum
        equivalent) and no sustain scoring (drum hits are always instantaneous). Cymbal-vs-tom, ghost notes, and
        accents are rendered on the highway but assumed not to change the point value. There is no drum equivalent
        of guitar's whammy, so Star Power gauge fill comes only from completing SP phrases (25% each); real drum
        Star Power is activated by playing through a "fill" zone rather than manually at any moment, which isn't
        modeled - the calculated activation timing may be slightly more flexible than what's actually achievable.
        Treat the drum max score as a reasonable estimate, not a guaranteed exact figure the way guitar/bass is.
      </p>
      <p className="assumptions__caveat">
        <strong>Drums</strong> and <strong>Pro Drums</strong> are offered as separate instruments, matching Clone
        Hero's own leaderboards - confirmed by comparing real leaderboard URLs for the same chart: both use the{' '}
        <em>exact same</em> SongHash, only the <code>instrument</code> and <code>controllerTypes</code> URL
        parameters differ (<code>drums</code>/<code>5LaneDrums</code> vs.{' '}
        <code>prodrums</code>/<code>7LaneDrums,5LaneDrums</code>). This app computes identical chart data and an
        identical calculated score for both - there's currently no evidence the underlying scoring formula itself
        differs between the two modes, only that real players' hardware (and therefore what they can accurately
        hit) does.
      </p>
      <p className="assumptions__caveat">
        The "View on Clone Hero Leaderboards" link reconstructs the same hash Clone Hero itself computes to identify
        a chart on <code>leaderboards.clonehero.net</code>, reverse-engineered from the game's code and verified
        byte-for-byte against several real leaderboard hashes. It only appears when <strong>song.ini</strong> was
        uploaded alongside the chart, since the hash embeds the song length, the modchart flag, and the charter
        icon name - none of which can be reliably determined from a chart file alone. Confirmed directly by a
        Clone Hero developer: "there are some defaults the game uses but it just means you will have random
        charts that are incorrect [...] because those ini values that we do include change the parsed chart in
        some way" - i.e. even the game itself can't reliably fall back to chart-only defaults, which is why this
        app doesn't try to either. The hash also embeds an
        entry for every charted <em>playable, scored</em> instrument this app can't parse (pro-instrument tracks,
        5-lane Drums) - if the file has any, the link is hidden, since it can never be
        reconstructed correctly without them. Lead/harmony vocals are the one exception: Clone Hero doesn't
        support playable vocal scoring (a charted vocals track only drives the on-screen scrolling lyrics), and a
        real capture of a chart with a charted vocals track confirmed its SongHash has no entry for it at all - so
        vocals don't block the link. Within what's left, it is <strong>fully confirmed</strong> for
        Guitar/Bass/Rhythm tracks from both <code>.chart</code> <em>and</em> <code>.mid</code> files, and for{' '}
        <code>.mid</code>-format Drums - all end-to-end verified against a real multi-instrument{' '}
        <code>.mid</code> capture (including working out exactly how a HOPO/forced marker authored only on the
        Expert difficulty carries over to the other difficulties, and reverse-engineering the drum note/dynamics
        encoding: kick/snare/cymbal-vs-tom lanes, ghost/accent velocity, double-kick, and drum-fill zones).{' '}
        <code>.chart</code>-format Drums is also included, but as a best-effort port of the documented{' '}
        <code>.chart</code> drum note format (note types for kick/red/yellow/blue/green, double-kick,
        cymbal/ghost/accent modifiers, and the SP activation/fill phrase) - not independently verified against a
        real capture the way everything else on this list is. For Keyboard and 6-Fret Guitar/Bass, the same
        algorithm is applied but with an unverified instrument index.
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
      <p className="assumptions__caveat">
        <strong>Die Schlagzeug-Wertung ist eine Best-Effort-Schätzung, nicht gegen echtes Gameplay verifiziert</strong>{' '}
        (im Gegensatz zu allem oberhalb dieser Zeile). Sie nutzt dieselbe Combo-/Multiplikator-/Star-Power-Engine
        wie Gitarre - jeder Schlagzeug-Treffer ist <strong>50 Punkte</strong> wert, genauso viel wie eine
        Gitarren-Note. (Eine frühere Version dieser App nahm 25 an - die Hälfte einer Gitarren-Note, eine ältere
        Konvention aus diesem Spiele-Genre - aber ein echter Platz-1-Score für ein Pro-Drums-Chart lag{' '}
        <em>höher</em> als diese Schätzung, was für ein echtes Maximum nie passieren darf, weshalb die Annahme
        korrigiert wurde.) Ein Doppel-Kick-Treffer (beide Pedale gleichzeitig) zählt für die Wertung als zwei
        gleichzeitige Kick-Treffer, wie ein Akkord - unverifiziert, aber dadurch landet der berechnete Max-Score
        knapp über statt unter diesem echten Score. Kein Clean-Play-Bonus (ein Gitarre-/Bass-spezifischer
        Anschlag-Genauigkeits-Mechanismus ohne Schlagzeug-Äquivalent) und keine Sustain-Wertung
        (Schlagzeug-Treffer sind immer punktuell). Cymbal-vs-Tom, Ghost Notes und Akzente werden im Highway
        dargestellt, aber es wird angenommen, dass sie den Punktwert nicht verändern. Es gibt kein
        Schlagzeug-Äquivalent zum Gitarren-Whammy, daher füllt sich die Star-Power-Leiste nur durch abgeschlossene
        SP-Phrasen (je 25%); echte Schlagzeug-Star-Power wird durch das Spielen einer "Fill"-Zone aktiviert statt
        manuell zu einem beliebigen Zeitpunkt - das ist nicht modelliert, die berechnete Aktivierungs-Flexibilität
        kann daher etwas großzügiger sein als tatsächlich erreichbar. Den Schlagzeug-Max-Score als vernünftige
        Schätzung betrachten, nicht als garantiert exakten Wert wie bei Gitarre/Bass.
      </p>
      <p className="assumptions__caveat">
        <strong>Drums</strong> und <strong>Pro Drums</strong> werden als getrennte Instrumente angeboten, passend
        zu Clone Heros eigenen Leaderboards - bestätigt durch den Vergleich echter Leaderboard-URLs für dasselbe
        Chart: beide nutzen <em>exakt denselben</em> SongHash, nur die URL-Parameter <code>instrument</code> und{' '}
        <code>controllerTypes</code> unterscheiden sich (<code>drums</code>/<code>5LaneDrums</code> vs.{' '}
        <code>prodrums</code>/<code>7LaneDrums,5LaneDrums</code>). Diese App berechnet für beide identische
        Chart-Daten und einen identischen Score - es gibt aktuell keinen Hinweis darauf, dass sich die
        Wertungsformel zwischen den Modi unterscheidet, nur dass sich unterscheidet, welche Hardware echte
        Spieler nutzen (und damit, was sie tatsächlich präzise treffen können).
      </p>
      <p className="assumptions__caveat">
        Der Link "Auf Clone Hero Leaderboards ansehen" rekonstruiert denselben Hash, den Clone Hero selbst zur
        Identifikation eines Charts auf <code>leaderboards.clonehero.net</code> berechnet - per Reverse Engineering
        aus dem Spielcode ermittelt und byte-genau gegen mehrere echte Leaderboard-Hashes verifiziert. Er erscheint
        nur, wenn zusätzlich eine <strong>song.ini</strong> hochgeladen wurde, da der Hash die Songlänge, das
        Modchart-Flag und den Charter-Icon-Namen enthält - Werte, die sich aus einer Chart-Datei allein nicht
        zuverlässig bestimmen lassen. Direkt von einem Clone-Hero-Entwickler bestätigt: "there are some defaults
        the game uses but it just means you will have random charts that are incorrect [...] because those ini
        values that we do include change the parsed chart in some way" - selbst das Spiel selbst kann sich also
        nicht zuverlässig auf Chart-only-Defaults verlassen, weshalb diese App es auch nicht versucht. Der Hash
        enthält außerdem einen Eintrag für jedes gechartete <em>spielbare, gewertete</em> Instrument, das diese
        App nicht parsen kann (Pro-Instrument-Spuren, 5-Lane-Schlagzeug) - hat die Datei welche, wird
        der Link ausgeblendet, da er ohne sie nie korrekt rekonstruierbar wäre. Gesang (Lead und Harmonien) ist die
        eine Ausnahme: Clone Hero unterstützt keine spielbare Gesangswertung (eine gechartete Gesangsspur steuert
        nur den eingeblendeten Songtext) - ein echter Mitschnitt eines Charts mit gecharteter Gesangsspur
        bestätigte, dass dessen SongHash gar keinen Eintrag dafür enthält. Gesang blockiert den Link also nicht.
        Innerhalb dessen gilt das als <strong>vollständig bestätigt</strong> für
        Gitarre-/Bass-/Rhythmus-Spuren sowohl aus <code>.chart</code>- <em>als auch</em> <code>.mid</code>-Dateien,
        sowie für <code>.mid</code>-Schlagzeug - alles Ende-zu-Ende verifiziert an einem echten Mitschnitt eines
        Mehrinstrumenten-<code>.mid</code>-Charts (inklusive der genauen Klärung, wie ein nur auf der
        Expert-Schwierigkeit gesetzter HOPO-/Forced-Marker auf die anderen Schwierigkeiten durchschlägt, und der
        vollständigen Entschlüsselung der Schlagzeug-Noten-/Dynamik-Kodierung: Kick/Snare/Cymbal-vs-Tom-Spuren,
        Ghost-/Akzent-Velocity, Double-Kick und Fill-Zonen). <code>.chart</code>-Schlagzeug ist ebenfalls
        enthalten, allerdings als Best-Effort-Portierung des dokumentierten <code>.chart</code>-Schlagzeug-Notenformats
        (Notentypen für Kick/Rot/Gelb/Blau/Grün, Double-Kick, Cymbal-/Ghost-/Akzent-Modifikatoren und die
        SP-Aktivierungs-/Fill-Phrase) - nicht unabhängig gegen einen echten Mitschnitt verifiziert wie alles andere
        in dieser Liste. Für Keyboard und 6-Fret-Gitarre/-Bass wird derselbe Algorithmus angewendet, jedoch mit
        unverifiziertem Instrument-Index.
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
