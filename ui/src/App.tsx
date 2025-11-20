import React, { useState, useRef, useEffect } from 'react';
import "./App.css";

// Tab bersaglio: dove vive il player che vogliamo controllare
const TARGET_URL_PATTERNS = [
  '*://*.youtube.com/*',
  '*://*.discogs.com/*',
  '*://*.bandcamp.com/*',
];

// una sola chiave globale, basta drammi
const STORAGE_KEY = 'pitchlab-mk2-panel-state-v1';

// -----------------------------
// Helpers
// -----------------------------

function clampPitch(pitch: number): number {
  const MIN = -8;
  const MAX = 8;
  if (!Number.isFinite(pitch)) return 0;
  return Math.min(MAX, Math.max(MIN, pitch));
}

// playbackRate = (rpmPlay / rpmOrig) * (1 + pitch/100)
function computeRate(pitchPercent: number, rpmOrig: number, rpmPlay: number): number {
  const pitchFactor = 1 + pitchPercent / 100;
  const rpmFactor = rpmPlay / rpmOrig;
  return pitchFactor * rpmFactor;
}

// BPM da tap times (ms)
function computeTapBpm(taps: number[]): number | null {
  if (taps.length < 2) return null;

  const diffs: number[] = [];
  for (let i = 1; i < taps.length; i++) {
    diffs.push(taps[i] - taps[i - 1]);
  }
  const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const bpm = 60000 / avg;

  if (!Number.isFinite(bpm) || bpm <= 0 || bpm > 300) return null;
  return bpm;
}

// -----------------------------
// Messaging verso il content-script
// -----------------------------

function sendRateToActiveMediaTab(
  rate: number,
  onTabResolved?: (tab: any) => void
) {
  try {
    const chromeAny: any = chrome;

    chromeAny.tabs.query(
      { url: TARGET_URL_PATTERNS },
      (tabs: any[]) => {
        if (!tabs || !tabs.length) {
          console.warn('[PitchLab panel] No matching media tab found');
          return;
        }

        const tab = tabs[tabs.length - 1];
        if (!tab || !tab.id) {
          console.warn('[PitchLab panel] Matching tab has no id');
          return;
        }

        if (onTabResolved) {
          onTabResolved(tab);
        }

        chromeAny.tabs.sendMessage(
          tab.id,
          { type: 'PITCHLAB_SET_RATE', rate },
          (response: any) => {
            if (chromeAny.runtime.lastError) {
              console.warn(
                '[PitchLab panel] sendMessage error',
                chromeAny.runtime.lastError.message
              );
              return;
            }
            console.log('[PitchLab panel] response from tab:', response);
          }
        );
      }
    );
  } catch (err) {
    console.error('[PitchLab panel] sendRateToActiveMediaTab failed:', err);
  }
}

// -----------------------------
// COMPONENTE UI MK2
// -----------------------------

export default function App() {
  // pitch in percento, -8 .. +8
  const [pitch, setPitch] = useState(0);
  // RPM origine / riproduzione
  const [rpmOrig, setRpmOrig] = useState(33);
  const [rpmPlay, setRpmPlay] = useState(33);

  // BPM: base (originale), BPM da tap, BPM attuale
  const [baseBpm, setBaseBpm] = useState<number | null>(null);
  const [tapBpm, setTapBpm] = useState<number | null>(null);
  const tapTimesRef = useRef<number[]>([]);

  // Badge “chi sto controllando”
  const [lastTargetLabel, setLastTargetLabel] = useState<string | null>(null);

  const effectiveRate = computeRate(pitch, rpmOrig, rpmPlay);
  const detent = Math.abs(pitch) < 0.05;

  // Track dello slider: colore solo tra 0 e il pitch attuale
  const minPitch = -8;
  const maxPitch = 8;

  // helper: converte valore pitch -> posizione in % lungo la track, tenendo conto del flip verticale
  function toTrackPos(value: number): number {
    const pct = ((value - minPitch) / (maxPitch - minPitch)) * 100;
    return 100 - pct; // flip perché lo slider verticale è ribaltato
  }

  const zeroPos = toTrackPos(0);
  const currentPos = toTrackPos(pitch);

  let sliderTrack = `linear-gradient(to top,
    #e5e5e5 0%,
    #e5e5e5 100%
  )`;

  if (pitch >= 0) {
    // pitch positivo: colore dal centro verso il basso
    sliderTrack = `linear-gradient(to top,
      #e5e5e5 0%,
      #e5e5e5 ${currentPos}%,
      #22c55e ${currentPos}%,
      #22c55e ${zeroPos}%,
      #e5e5e5 ${zeroPos}%,
      #e5e5e5 100%
    )`;
  } else {
    // pitch negativo: colore dal centro verso l'alto
    sliderTrack = `linear-gradient(to top,
      #e5e5e5 0%,
      #e5e5e5 ${zeroPos}%,
      #22c55e ${zeroPos}%,
      #22c55e ${currentPos}%,
      #e5e5e5 ${currentPos}%,
      #e5e5e5 100%
    )`;
  }
  const displayPitch = pitch.toFixed(2);
  const currentBpm = baseBpm != null ? baseBpm * effectiveRate : null;

  // -----------------------------
  // Helpers UI
  // -----------------------------

  function updateTargetLabelFromTab(tab: any) {
    try {
      const url: string | undefined = tab.url;
      if (!url) {
        setLastTargetLabel(null);
        return;
      }
      const u = new URL(url);
      const host = u.hostname.toLowerCase();

      let label = host;
      if (host.includes('youtube.com')) label = 'YouTube';
      else if (host.includes('discogs.com')) label = 'Discogs';
      else if (host.includes('bandcamp.com')) label = 'Bandcamp';

      setLastTargetLabel(label);
    } catch {
      setLastTargetLabel(null);
    }
  }

  // -----------------------------
  // Carica stato da localStorage all'avvio
  // e riallinea SUBITO il player
  // -----------------------------

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as {
        pitch?: number;
        rpmOrig?: number;
        rpmPlay?: number;
        baseBpm?: number | null;
      };

      let loadedPitch = pitch;
      let loadedOrig = rpmOrig;
      let loadedPlay = rpmPlay;
      let loadedBaseBpm: number | null = baseBpm;

      if (typeof parsed.pitch === 'number') {
        loadedPitch = clampPitch(parsed.pitch);
        setPitch(loadedPitch);
      }

      if (parsed.rpmOrig === 33 || parsed.rpmOrig === 45) {
        loadedOrig = parsed.rpmOrig;
        setRpmOrig(parsed.rpmOrig);
      }

      if (parsed.rpmPlay === 33 || parsed.rpmPlay === 45) {
        loadedPlay = parsed.rpmPlay;
        setRpmPlay(parsed.rpmPlay);
      }

      if (parsed.baseBpm == null || typeof parsed.baseBpm === 'number') {
        loadedBaseBpm = parsed.baseBpm ?? null;
        setBaseBpm(loadedBaseBpm);
      }

      const initialRate = computeRate(loadedPitch, loadedOrig, loadedPlay);
      sendRateToActiveMediaTab(initialRate, updateTargetLabelFromTab);
    } catch (err) {
      console.warn('[PitchLab panel] failed to load state from localStorage', err);
    }
    // vogliamo farlo SOLO al mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------
  // Salva stato ogni volta che cambia
  // -----------------------------

  useEffect(() => {
    try {
      const toStore = { pitch, rpmOrig, rpmPlay, baseBpm };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    } catch (err) {
      console.warn('[PitchLab panel] failed to save state to localStorage', err);
    }
  }, [pitch, rpmOrig, rpmPlay, baseBpm]);

  // -----------------------------
  // Pitch / RPM logic
  // -----------------------------

  function applyPitch(newPitch: number) {
    const clamped = clampPitch(newPitch);
    setPitch(clamped);

    const newRate = computeRate(clamped, rpmOrig, rpmPlay);
    sendRateToActiveMediaTab(newRate, updateTargetLabelFromTab);
  }

  function handleSliderChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = parseFloat(e.target.value);
    applyPitch(value);
  }

  function handleNudgePercent(deltaPercent: number) {
    const newPitch = pitch + deltaPercent;
    applyPitch(newPitch);
  }

  // Cambiare RPM NON tocca il valore di pitch,
  // ma cambia la base del rate (come un vero piatto)
  function applyRpmChange(newOrig: number, newPlay: number) {
    setRpmOrig(newOrig);
    setRpmPlay(newPlay);

    const newRate = computeRate(pitch, newOrig, newPlay);
    sendRateToActiveMediaTab(newRate, updateTargetLabelFromTab);
  }
  function handleFullReset() {
    // reset stato interno
    setPitch(0);
    setRpmOrig(33);
    setRpmPlay(33);

    setBaseBpm(null);
    setTapBpm(null);
    tapTimesRef.current = [];

    // rimetti il player del browser a 1.0x
    sendRateToActiveMediaTab(1.0);
  }

  // -----------------------------
  // BPM TAP HANDLERS
  // -----------------------------

  function handleTap() {
    const now = performance.now();
    tapTimesRef.current.push(now);

    if (tapTimesRef.current.length > 6) {
      tapTimesRef.current.shift();
    }

    const bpm = computeTapBpm(tapTimesRef.current);
    if (bpm) {
      setTapBpm(bpm);
    }
  }

  function resetTap() {
    tapTimesRef.current = [];
    setTapBpm(null);
  }

  function useTappedBpm() {
    if (tapBpm == null) return;
    setBaseBpm(tapBpm);
  }

  function resetBaseBpm() {
    setBaseBpm(null);
  }
// -----------------------------
// Key bindings (T = TAP tempo)
// -----------------------------
useEffect(() => {
  function handleKey(e: KeyboardEvent) {
    // evita casini caso utente scriva in qualche input (in futuro)
    const target = e.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      return;
    }

    // T / t → TAP
    if (e.key === 't' || e.key === 'T') {
      e.preventDefault();
      handleTap();
    }
  }

  window.addEventListener('keydown', handleKey);
  return () => window.removeEventListener('keydown', handleKey);
}, []);
  // -----------------------------
  // UI
  // -----------------------------
  return (
    <div className="min-h-screen w-full bg-neutral-950 text-neutral-100 p-4 sm:p-8">
      <div className="mx-auto max-w-5xl rounded-2xl bg-gradient-to-b from-neutral-900 to-neutral-950 shadow-2xl ring-1 ring-neutral-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-green-400 shadow-[0_0_12px_2px_rgba(74,222,128,0.7)]" />
            <h1 className="text-xl font-semibold tracking-wide">
             PitchLab MK2
            </h1>
            <span className="text-xs px-2 py-0.5 rounded bg-neutral-800/70 border border-neutral-700">
              Extension Panel
            </span>
          </div>

          <div className="flex flex-col items-end gap-1 text-xs text-neutral-400">
            <span>Targets: YouTube · Discogs · Bandcamp</span>
            {lastTargetLabel && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-800 border border-neutral-700 text-[10px] text-neutral-200">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                Controlling: {lastTargetLabel}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1.1fr] gap-6 p-6">
          {/* Colonna sinistra: RPM + Pitch slider */}
          <div className="flex flex-col gap-6">
            {/* RPM block */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
              <h2 className="text-sm font-medium text-neutral-300 mb-3">
                Virtual Deck RPM
              </h2>
              <div className="grid gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-400">Origine</span>
                  <div className="inline-flex rounded-lg overflow-hidden border border-neutral-700">
                    {[33, 45].map((val) => (
                      <button
                        key={`orig-${val}`}
                        className={[
                          'px-3 py-1.5 text-xs border-r border-neutral-700 last:border-r-0',
                          rpmOrig === val
                            ? 'bg-green-500/10 text-green-300'
                            : 'bg-neutral-900 hover:bg-neutral-800/80',
                        ].join(' ')}
                        onClick={() => applyRpmChange(val, rpmPlay)}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-400">Riproduzione</span>
                  <div className="inline-flex rounded-lg overflow-hidden border border-neutral-700">
                    {[33, 45].map((val) => (
                      <button
                        key={`play-${val}`}
                        className={[
                          'px-3 py-1.5 text-xs border-r border-neutral-700 last:border-r-0',
                          rpmPlay === val
                            ? 'bg-green-500/10 text-green-300'
                            : 'bg-neutral-900 hover:bg-neutral-800/80',
                        ].join(' ')}
                        onClick={() => applyRpmChange(rpmOrig, val)}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2 text-xs text-neutral-400 flex items-center justify-between">
                  <span>Base RPM</span>
                  <span className="font-medium text-neutral-200">
                    Orig: {rpmOrig} • Play: {rpmPlay}
                  </span>
                </div>
              </div>
            </div>

            {/* Pitch slider block */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
              <h2 className="text-sm font-medium text-neutral-300 mb-2">Pitch</h2>
              <div className="flex items-center gap-4">
                {/* Scala laterale */}
                <div className="relative h-72 w-10 hidden sm:block">
                  <div className="absolute inset-0 mx-auto w-px bg-gradient-to-b from-transparent via-neutral-700 to-transparent" />
                  {Array.from({ length: 17 }).map((_, i) => {
                    const y = (i / 16) * 100;
                    const val = 8 - i; // da +8 a -8
                    const isMajor = i % 2 === 0;
                    return (
                      <div
                        key={i}
                        className="absolute left-0 right-0"
                        style={{ top: `${y}%` }}
                      >
                        <div
                          className={`${isMajor ? 'w-6' : 'w-3'} h-px bg-neutral-600 mx-auto`}
                        />
                        {isMajor && (
                          <div className="text-[10px] text-center text-neutral-400 mt-1">
                            {val}%
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* zero marker */}
                  <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-neutral-800 border border-neutral-700" />
                </div>

                {/* Slider verticale */}
                <div className="flex flex-col items-center gap-3">
                 <input
                  type="range"
                  min={-8}
                  max={8}
                  step={0.01}
                  value={pitch}
                  onChange={handleSliderChange}
                  className="h-72 w-2 bg-transparent"
                  style={{
                   WebkitAppearance: 'none',
                   writingMode: 'vertical-lr',
                   backgroundImage: sliderTrack,
                   backgroundRepeat: 'no-repeat',
                   backgroundSize: '100% 100%',
                   borderRadius: '999px',
                 }}
                />

              <div className="flex items-center gap-2 text-xs text-neutral-400">
               <span>Quartz lock</span>
               <span
                className={`h-2 w-2 rounded-full ${
                  detent ? 'bg-green-400' : 'bg-neutral-700'
                 }`}
                />
              </div>
             </div>

                {/* Display numerico */}
                <div className="ml-auto grid gap-2 text-right">
                  <div className="text-sm text-neutral-400">Pitch</div>
                  <div className="text-4xl font-bold tracking-tight tabular-nums">
                    {pitch >= 0 ? '+' : ''}
                    {displayPitch}%
                  </div>
                  <div className="text-xs text-neutral-500">Range ±8%</div>
                </div>
              </div>
            </div>

            {/* Full deck reset */}
            <div className="mt-4 flex justify-center">
             <button
              onClick={handleFullReset}
              className="px-4 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm font-semibold hover:bg-neutral-700 active:scale-95"
             >
             Full Deck Reset
            </button>
           </div>
          </div>
          {/* Colonna destra: Info + BPM + Nudge + Help */}
          <div className="grid grid-rows-[auto_auto_auto_1fr] gap-4">
            {/* Rate & info */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
              <h2 className="text-sm font-medium text-neutral-300 mb-3">
                Playback info
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-neutral-700 bg-neutral-800/60 p-3">
                  <div className="text-xs text-neutral-400">Playback rate</div>
                  <div className="text-2xl font-semibold tabular-nums">
                    {effectiveRate.toFixed(4)}x
                  </div>
                </div>
                <div className="rounded-lg border border-neutral-700 bg-neutral-800/60 p-3">
                  <div className="text-xs text-neutral-400">Current BPM</div>
                  <div className="text-2xl font-semibold tabular-nums">
                    {currentBpm != null ? currentBpm.toFixed(2) : '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* BPM block */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
              <h2 className="text-sm font-medium text-neutral-300 mb-3">
                BPM (Tap block)
              </h2>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="rounded-lg border border-neutral-700 bg-neutral-800/60 p-3">
                  <div className="text-xs text-neutral-400">BPM TAP</div>
                  <div className="text-2xl font-semibold tabular-nums">
                    {tapBpm != null ? tapBpm.toFixed(2) : '—'}
                  </div>
                </div>
                <div className="rounded-lg border border-neutral-700 bg-neutral-800/60 p-3">
                  <div className="text-xs text-neutral-400">BPM base</div>
                  <div className="text-2xl font-semibold tabular-nums">
                    {baseBpm != null ? baseBpm.toFixed(2) : '—'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <button
                  className="px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-xs font-semibold active:scale-95"
                  onClick={handleTap}
                >
                  TAP
                </button>
                <button
                  className="px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-xs active:scale-95"
                  onClick={resetTap}
                >
                  Reset TAP
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  className="px-3 py-2 rounded-lg bg-green-700/80 hover:bg-green-600/80 text-xs font-semibold active:scale-95 disabled:opacity-40 disabled:hover:bg-green-700/80"
                  onClick={useTappedBpm}
                  disabled={tapBpm == null}
                >
                  Set BPM
                </button>
                <button
                  className="px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-xs active:scale-95"
                  onClick={resetBaseBpm}
                >
                  Clear Base BPM
                </button>
              </div>

              <div className="mt-3 text-xs text-neutral-400 border-t border-neutral-800 pt-2">
                Current BPM:{' '}
                <span className="font-semibold text-neutral-100">
                  {currentBpm != null ? currentBpm.toFixed(2) : '—'}
                </span>
                {baseBpm != null && (
                  <span className="text-neutral-500">
                    {' '}
                    &nbsp;({baseBpm.toFixed(2)} × {effectiveRate.toFixed(4)}x)
                  </span>
                )}
              </div>
            </div>

            {/* Nudge */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
              <h2 className="text-sm font-medium text-neutral-300 mb-3">
                Nudge controls
              </h2>
              <div className="flex flex-wrap gap-2 items-center">
                <button
                  className="px-3 py-1.5 rounded-lg bg-neutral-800 border border-neutral-700 text-xs active:scale-95"
                  onClick={() => handleNudgePercent(-0.25)}
                >
                  −0.25%
                </button>
                <button
                  className="px-3 py-1.5 rounded-lg bg-neutral-800 border border-neutral-700 text-xs active:scale-95"
                  onClick={() => handleNudgePercent(+0.25)}
                >
                  +0.25%
                </button>
                <button
                  className="px-3 py-1.5 rounded-lg bg-neutral-800 border border-neutral-700 text-xs active:scale-95 ml-auto"
                  onClick={() => applyPitch(0)}
                >
                  Reset 0%
                </button>
              </div>
            </div>

            {/* Help / note */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 text-xs text-neutral-400">
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  <span className="font-semibold text-neutral-200">Origin:</span> fixed reference speed of the record (33 / 45).
                </li>
                <li>
                  <span className="font-semibold text-neutral-200">Playback:</span> virtual platter speed applied to browser audio.
                </li>
                <li>
                  <span className="font-semibold text-neutral-200">Pitch:</span> ±8% range applied on top of RPM, like a real deck.
                </li>
                <li>
                  <span className="font-semibold text-neutral-200">Base BPM:</span> multiplied by playback rate to calculate Current BPM.
                </li>
                <li>
                  <span className="font-semibold text-neutral-200">Full Deck Reset:</span> restores RPM, pitch, playback rate and BPM settings to default.
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-neutral-800 text-[11px] text-neutral-500 flex flex-wrap items-center gap-3 tracking-widest uppercase select-none">
       <span>© {new Date().getFullYear()} PitchLab MK2</span>
       <span className="opacity-40">•</span>
       <span>Browser Deck Control</span>
       <span className="opacity-40">•</span>
       <span className="text-neutral-400">Paolo Olivieri</span>
       </div>
      </div>
    </div>
  );
}
