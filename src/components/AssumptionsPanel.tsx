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
        <strong>Drums scoring is a best-effort estimate, not verified the byte-exact way everything above this
        line is</strong> - but its point values ARE checked against real leaderboard scores' own point
        breakdowns, pulled directly from Clone Hero's public score API (which exposes fields like{' '}
        <code>noteScore</code>, <code>comboScore</code>, <code>spScore</code>, <code>ghostsHit</code>,{' '}
        <code>accentsHit</code> per score - much more precise than the score details shown in the website's UI).
        It reuses the same combo/multiplier/Star Power engine as guitar. Kick, snare, and tom hits are worth{' '}
        <strong>50 points</strong>, the same as a guitar note. (An earlier version of this app assumed 25 - half
        of guitar's value, an older convention from this game genre - but a real #1 leaderboard score for a Pro
        Drums chart came in <em>higher</em> than that estimate, which can never happen for a true maximum, so the
        assumption was raised to 50.) <strong>Cymbal hits are worth 65 points</strong> - found by decomposing a
        real #1 score's exact <code>noteScore</code> value: for a chart with 969 non-cymbal and 570 cymbal notes,
        that value (85,450, for a run that missed exactly 1 non-cymbal note) only balances at 50 and 65
        respectively, to the exact point. <strong>Ghost/accent notes hit with the correct dynamic score an extra
        flat, unmultiplied 50 points each</strong> - found because 5 of 6 real scores with a nonzero{' '}
        <code>ghostsHit</code>/<code>accentsHit</code> count had a <code>totalScore</code> that exceeded the sum
        of every one of their own named breakdown fields by <em>exactly</em> 50 points per such hit (the 6th was
        internally inconsistent in an unrelated way - its <code>comboScore</code> field read 0 despite a large
        max combo, so it was treated as a bad record). This bonus isn't broken out under any named field - not
        even the confusingly similarly-named <code>ghostScore</code>, which reads 0 in every real example checked
        regardless of <code>ghostsHit</code> count - it only shows up as a gap between the total and the sum of
        the parts. With cymbal points, the ghost/accent bonus, and the "Expert+"/2x-kick exclusion (below)
        combined, the calculated full-combo max for that same real chart lands comfortably above the real
        near-full-combo score that missed only 1 of 1,539 notes - the expected pattern, and the strongest evidence
        yet this formula is close to correct. No clean-play bonus beyond that (a guitar/bass strum-accuracy
        mechanic with no direct drum equivalent) and no sustain scoring (drum hits are always instantaneous).
        There is no drum equivalent of guitar's whammy, so Star Power gauge fill comes only from completing SP
        phrases (25% each); real drum Star Power is activated by playing through a "fill" zone rather than
        manually at any moment, which isn't modeled - the calculated activation timing may be slightly more
        flexible than what's actually achievable. Solo bonus is still unconfirmed either way (guitar's value,
        carried over) since no drum chart with a solo section has been checked against a real score yet. Treat
        the drum max score as a well-reasoned estimate, not a guaranteed exact figure the way guitar/bass is.
      </p>
      <p className="assumptions__caveat">
        <strong>"Expert+" / 2x-kick notes</strong> (an alternate kick note that lets a fast section be played with
        a second pedal instead of one) are charted on top of the regular Expert pattern but are{' '}
        <em>not part of the default chart</em>: a real leaderboard capture confirmed Clone Hero excludes them
        entirely from the default note count and every real player's accuracy denominator (the game shows 1,539
        notes for a chart this app parses as 1,631 raw hits - a gap of exactly 92, matching its count of these
        alternate-kick notes one for one). They only become playable under a separate, alternate leaderboard -
        Clone Hero has a distinct <strong>"Double Kick" score modifier</strong> with its own disjoint set of
        players and its own (lower, on the one real example checked) top scores, confirming these notes are an
        opt-in variant ruleset rather than bonus content within the normal chart. (An earlier version of this app
        instead scored them as two simultaneous kick hits under the default ruleset, reasoning that real
        leaderboard scores implied they must count for something - that reasoning turned out to conflate the
        modifier's alternate leaderboard with the default one, and has been reverted.)
      </p>
      <p className="assumptions__caveat">
        Drums and Pro Drums get a <strong>Modifier</strong> selector for the two Clone Hero score modifiers
        confirmed (via its real score API) to change the scored note set - selecting{' '}
        <strong>"Double Kick"</strong> includes the "Expert+" notes above as regular kick hits;{' '}
        <strong>"No Kick"</strong> removes every kick-lane note entirely, confirmed against a real chart's exact
        numbers: its note count dropped by precisely its kick-note count, and its reference max score dropped by
        precisely that count × 50 points. Clone Hero has roughly 20 score modifiers in total (mirrored
        highway, precision timing windows, forced HOPOs, etc.) - the rest are player/assist settings with no
        evidence they change the note set or point values, so they aren't offered here, and Guitar/Bass don't get
        a modifier selector at all for the same reason. The "View on Clone Hero Leaderboards" link's{' '}
        <code>modifiers</code> parameter follows whichever one is selected.
      </p>
      <p className="assumptions__caveat">
        <strong>Drums</strong> and <strong>Pro Drums</strong> are offered as separate instruments, matching Clone
        Hero's own leaderboards - confirmed by comparing real leaderboard URLs for the same chart: both use the{' '}
        <em>exact same</em> SongHash, only the <code>instrument</code> and <code>controllerTypes</code> URL
        parameters differ (<code>drums</code>/<code>5LaneDrums</code> vs.{' '}
        <code>prodrums</code>/<code>7LaneDrums,5LaneDrums</code>). This app computes identical chart data and an
        identical calculated score for both - there's currently no evidence the underlying scoring formula itself
        differs between the two modes, only that real players' hardware (and therefore what they can accurately
        hit) does. In practice, on a real chart checked against the live leaderboard, the plain{' '}
        <strong>Drums</strong> leaderboard had a single old submission while every other player - regardless of
        which "Instrument" they picked in-game, real kit or 5-lane-compatible controller alike - showed up under{' '}
        <strong>Pro Drums</strong> instead, with the controller type as just a filter within that one leaderboard;
        Clone Hero's actual in-game instrument/controller selection doesn't appear to map onto this split as cleanly
        as the query parameters alone suggest, so the "Pro Drums" link is the one worth checking first.
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
        encoding: kick/snare/cymbal-vs-tom lanes, ghost/accent velocity, double-kick, and drum-fill zones). A real
        chart with an unusually dense, non-round tempo map (a "live session" recording with dozens of tempo
        changes, some fractional to the thousandth of a BPM) exposed a subtle bug in that verification: converting
        an authored <code>.chart</code> tempo to microseconds-per-quarter-note and back to BPM for the hash is a
        lossy floating-point round-trip - it can differ from the originally authored value in the last bit of the
        number (confirmed: a chart's <code>B 110000</code> line round-tripped to <code>110.00000000000001</code>{' '}
        instead of <code>110</code>), which is enough to produce a completely different hash. Fixed by keeping the
        exact authored BPM value on hand instead of re-deriving it.{' '}
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
        <strong>
          Die Schlagzeug-Wertung ist eine Best-Effort-Schätzung, nicht byte-genau verifiziert wie alles oberhalb
          dieser Zeile
        </strong>{' '}
        - aber ihre Punktwerte sind gegen die eigene Punkte-Aufschlüsselung echter Bestenlisten-Scores geprüft,
        direkt aus Clone Heros öffentlicher Score-API geholt (die Felder wie <code>noteScore</code>,{' '}
        <code>comboScore</code>, <code>spScore</code>, <code>ghostsHit</code>, <code>accentsHit</code> pro Score
        liefert - deutlich präziser als die Score-Details in der Website-Oberfläche). Sie nutzt dieselbe
        Combo-/Multiplikator-/Star-Power-Engine wie Gitarre. Kick, Snare und Tom-Treffer sind{' '}
        <strong>50 Punkte</strong> wert, genauso viel wie eine Gitarren-Note. (Eine frühere Version dieser App
        nahm 25 an - die Hälfte einer Gitarren-Note, eine ältere Konvention aus diesem Spiele-Genre - aber ein
        echter Platz-1-Score für ein Pro-Drums-Chart lag <em>höher</em> als diese Schätzung, was für ein echtes
        Maximum nie passieren darf, weshalb die Annahme auf 50 angehoben wurde.){' '}
        <strong>Cymbal-Treffer sind 65 Punkte wert</strong> - gefunden durch Zerlegung des exakten{' '}
        <code>noteScore</code>-Werts eines echten Platz-1-Scores: bei einem Chart mit 969 Nicht-Cymbal- und 570
        Cymbal-Noten geht dieser Wert (85.450, für einen Lauf mit genau 1 verpassten Nicht-Cymbal-Note) nur bei 50
        bzw. 65 exakt auf. <strong>Ghost-/Akzent-Noten, die mit der korrekten Dynamik getroffen werden, geben
        zusätzlich einen festen, unmultiplizierten Bonus von 50 Punkten pro Note</strong> - gefunden, weil bei 5
        von 6 echten Scores mit einem <code>ghostsHit</code>-/<code>accentsHit</code>-Wert &gt; 0 der{' '}
        <code>totalScore</code> die Summe aller eigenen benannten Aufschlüsselungs-Felder um <em>exakt</em> 50
        Punkte pro solchem Treffer überstieg (der 6. war auf eine unabhängige Art inkonsistent - dessen{' '}
        <code>comboScore</code>-Feld zeigte 0 trotz eines hohen Max-Combo, wurde also als fehlerhafter Datensatz
        behandelt). Dieser Bonus taucht in keinem benannten Feld auf - nicht einmal im verwirrend ähnlich
        benannten <code>ghostScore</code>, das in jedem geprüften echten Beispiel 0 zeigt, unabhängig vom{' '}
        <code>ghostsHit</code>-Wert - er zeigt sich nur als Lücke zwischen der Summe und dem Gesamtwert. Mit
        Cymbal-Punkten, Ghost-/Akzent-Bonus und dem Ausschluss der "Expert+"-/2x-Kick-Noten (unten) zusammen landet
        der berechnete Full-Combo-Max-Score für genau dieses Chart deutlich über dem echten
        Fast-Full-Combo-Score, der nur 1 von 1.539 Noten verpasste - das erwartete Muster, und der bislang
        stärkste Beleg dafür, dass diese Formel ungefähr stimmt. Kein Clean-Play-Bonus darüber hinaus (ein
        Gitarre-/Bass-spezifischer Anschlag-Genauigkeits-Mechanismus ohne direktes Schlagzeug-Äquivalent) und
        keine Sustain-Wertung (Schlagzeug-Treffer sind immer punktuell). Es gibt kein Schlagzeug-Äquivalent zum
        Gitarren-Whammy, daher füllt sich die Star-Power-Leiste nur durch abgeschlossene SP-Phrasen (je 25%);
        echte Schlagzeug-Star-Power wird durch das Spielen einer "Fill"-Zone aktiviert statt manuell zu einem
        beliebigen Zeitpunkt - das ist nicht modelliert, die berechnete Aktivierungs-Flexibilität kann daher etwas
        großzügiger sein als tatsächlich erreichbar. Der Solo-Bonus ist weiterhin unbestätigt (von Gitarre
        übernommener Wert), da noch kein Schlagzeug-Chart mit Solo-Abschnitt gegen einen echten Score geprüft
        wurde. Den Schlagzeug-Max-Score als gut begründete Schätzung betrachten, nicht als garantiert exakten Wert
        wie bei Gitarre/Bass.
      </p>
      <p className="assumptions__caveat">
        <strong>"Expert+"-/2x-Kick-Noten</strong> (eine alternative Kick-Note, mit der eine schnelle Passage statt
        mit einem mit zwei Pedalen gespielt werden kann) sind zusätzlich zum regulären Expert-Pattern gechartet,
        aber <em>nicht Teil des Standard-Charts</em>: ein echter Leaderboard-Mitschnitt bestätigte, dass Clone
        Hero sie komplett aus der Standard-Notenanzahl und aus der Genauigkeits-Nennerangabe jedes echten Spielers
        ausschließt (das Spiel zeigt 1.539 Noten für ein Chart, das diese App als 1.631 rohe Treffer parst - eine
        Differenz von exakt 92, die eins zu eins der Anzahl dieser alternativen Kick-Noten entspricht). Spielbar
        werden sie nur unter einem separaten, alternativen Leaderboard - Clone Hero hat einen eigenen{' '}
        <strong>"Double Kick"-Score-Modifier</strong> mit einer komplett anderen Spielerliste und eigenen (beim
        einen geprüften Beispiel niedrigeren) Bestwerten, was bestätigt, dass diese Noten eine optionale
        Alternativ-Wertung sind statt Bonusinhalt innerhalb des normalen Charts. (Eine frühere Version dieser App
        wertete sie stattdessen unter der Standard-Wertung als zwei gleichzeitige Kick-Treffer, mit der Annahme,
        dass echte Bestenlisten-Scores implizieren, dass sie irgendwie zählen müssen - diese Annahme vermischte
        fälschlich das alternative Leaderboard des Modifiers mit dem Standard-Leaderboard und wurde
        zurückgenommen.)
      </p>
      <p className="assumptions__caveat">
        Schlagzeug und Pro-Schlagzeug bekommen einen <strong>Modifier</strong>-Auswahl für die beiden Clone-Hero-
        Score-Modifier, die (über die echte Score-API bestätigt) tatsächlich die gewertete Notenmenge verändern -{' '}
        <strong>"Double Kick"</strong> nimmt die oben genannten "Expert+"-Noten als normale Kick-Treffer mit auf;{' '}
        <strong>"No Kick"</strong> entfernt jede Kick-Lane-Note vollständig, bestätigt an den exakten Zahlen eines
        echten Charts: die Notenanzahl sank exakt um dessen Kick-Notenanzahl, der Referenz-Max-Score exakt um
        diese Anzahl × 50 Punkte. Clone Hero hat insgesamt rund 20 Score-Modifier (gespiegelter Highway,
        Präzisions-Timing-Fenster, erzwungene HOPOs, etc.) - der Rest sind Spieler-/Assist-Einstellungen ohne
        Hinweis darauf, dass sie die Notenmenge oder Punktwerte verändern, weshalb sie hier nicht angeboten
        werden, und Gitarre/Bass bekommen aus demselben Grund gar keine Modifier-Auswahl. Der{' '}
        <code>modifiers</code>-Parameter im "Auf Clone Hero Leaderboards ansehen"-Link folgt der jeweiligen
        Auswahl.
      </p>
      <p className="assumptions__caveat">
        <strong>Drums</strong> und <strong>Pro Drums</strong> werden als getrennte Instrumente angeboten, passend
        zu Clone Heros eigenen Leaderboards - bestätigt durch den Vergleich echter Leaderboard-URLs für dasselbe
        Chart: beide nutzen <em>exakt denselben</em> SongHash, nur die URL-Parameter <code>instrument</code> und{' '}
        <code>controllerTypes</code> unterscheiden sich (<code>drums</code>/<code>5LaneDrums</code> vs.{' '}
        <code>prodrums</code>/<code>7LaneDrums,5LaneDrums</code>). Diese App berechnet für beide identische
        Chart-Daten und einen identischen Score - es gibt aktuell keinen Hinweis darauf, dass sich die
        Wertungsformel zwischen den Modi unterscheidet, nur dass sich unterscheidet, welche Hardware echte
        Spieler nutzen (und damit, was sie tatsächlich präzise treffen können). In der Praxis zeigte sich bei
        einem echten, gegen das Live-Leaderboard geprüften Chart: Das reine <strong>Drums</strong>-Leaderboard
        hatte nur eine einzige, alte Einreichung, während alle anderen Spieler - unabhängig davon, welches
        "Instrument" sie im Spiel gewählt hatten, echtes Kit oder 5-Lane-kompatibler Controller - unter{' '}
        <strong>Pro Drums</strong> auftauchten, mit dem Controller-Typ lediglich als Filter innerhalb dieses einen
        Leaderboards. Clone Heros tatsächliche Instrument-/Controller-Auswahl im Spiel scheint sich nicht so
        sauber auf diese Aufteilung abzubilden, wie es allein die Query-Parameter nahelegen - der "Pro
        Drums"-Link ist also der, den man zuerst prüfen sollte.
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
        Ghost-/Akzent-Velocity, Double-Kick und Fill-Zonen). Ein echtes Chart mit einer ungewöhnlich dichten,
        krummen Tempo-Kurve (ein "Live Session"-Mitschnitt mit Dutzenden Tempowechseln, manche auf ein
        Tausendstel BPM genau) deckte dabei einen subtilen Bug auf: Die Umrechnung eines authored{' '}
        <code>.chart</code>-Tempos in Mikrosekunden-pro-Viertelnote und zurück in BPM für den Hash ist ein
        verlustbehafteter Fließkomma-Umweg - er kann im letzten Bit vom ursprünglich authored Wert abweichen
        (bestätigt: eine <code>B 110000</code>-Zeile eines Charts wurde zu <code>110.00000000000001</code> statt{' '}
        <code>110</code> zurückgerechnet), was für einen komplett anderen Hash reicht. Behoben, indem der exakte
        authored BPM-Wert direkt vorgehalten wird, statt ihn neu herzuleiten. <code>.chart</code>-Schlagzeug ist
        ebenfalls enthalten, allerdings als Best-Effort-Portierung des dokumentierten <code>.chart</code>-Schlagzeug-Notenformats
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
