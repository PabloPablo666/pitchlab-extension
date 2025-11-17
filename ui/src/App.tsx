import React, { useState } from 'react';

// Tab bersaglio: dove vive il player che vogliamo controllare
const TARGET_URL_PATTERNS = [
  '*://*.youtube.com/*',
  '*://*.discogs.com/*',
  '*://*.bandcamp.com/*',
];

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

// -----------------------------
// Messaging verso il content-script
// -----------------------------

function sendRateToActiveMediaTab(rate: number) {
  try {
    const chromeAny: any = chrome;

    chromeAny.tabs.query(
      { url: TARGET_URL_PATTERNS },
      (tabs: any[]) => {
        if (!tabs || tabs.length === 0) {
          console.warn('[PitchLab panel] No matching media tab found');
          return;
        }

        const tab = tabs[tabs.length - 1];
        if (!tab || !tab.id) {
          console.warn('[PitchLab panel] Matching tab has no id');
          return;
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
// COMPONENTE UI
// -----------------------------

export default function App() {
  // pitch in percento, -8 .. +8
  const [pitch, setPitch] = useState(0); // 0% = base RPM

  // RPM origine / riproduzione
  const [rpmOrig, setRpmOrig] = useState(33);
  const [rpmPlay, setRpmPlay] = useState(33);

  // playbackRate effettivo (RPM + pitch)
  const effectiveRate = computeRate(pitch, rpmOrig, rpmPlay);

  function applyPitch(newPitch: number) {
    const clamped = clampPitch(newPitch);
    setPitch(clamped);

    const newRate = computeRate(clamped, rpmOrig, rpmPlay);
    sendRateToActiveMediaTab(newRate);
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
    sendRateToActiveMediaTab(newRate);
  }

  return (
    <div
      style={{
        padding: 20,
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        color: '#f5f5f5',
        background: '#050608',
        minHeight: '100vh',
      }}
    >
      <h1 style={{ marginTop: 0, marginBottom: 16 }}>PitchLab MK2 Panel</h1>

      {/* ---------------------- */}
      {/*     BLOCCO RPM         */}
      {/* ---------------------- */}

      <div
        style={{
          background: '#111',
          borderRadius: 8,
          padding: 16,
          border: '1px solid #333',
          maxWidth: 480,
          marginBottom: 20,
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: 18 }}>
          Origine / Riproduzione
        </h2>

        <div
          style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}
        >
          <span>Origine</span>
          <select
            value={rpmOrig}
            onChange={(e) => applyRpmChange(parseInt(e.target.value, 10), rpmPlay)}
            style={{ background: '#000', color: '#fff', border: '1px solid #444' }}
          >
            <option value={33}>33</option>
            <option value={45}>45</option>
          </select>
        </div>

        <div
          style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}
        >
          <span>Riproduzione</span>
          <select
            value={rpmPlay}
            onChange={(e) => applyRpmChange(rpmOrig, parseInt(e.target.value, 10))}
            style={{ background: '#000', color: '#fff', border: '1px solid #444' }}
          >
            <option value={33}>33</option>
            <option value={45}>45</option>
          </select>
        </div>

        <div
          style={{
            marginTop: 8,
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12,
            opacity: 0.8,
          }}
        >
          <span>Base RPM</span>
          <span>
            Orig: {rpmOrig} • Play: {rpmPlay}
          </span>
        </div>
      </div>

      {/* ---------------------- */}
      {/*       BLOCCO PITCH     */}
      {/* ---------------------- */}

      <div
        style={{
          background: '#111',
          borderRadius: 8,
          padding: 16,
          border: '1px solid #333',
          maxWidth: 480,
        }}
      >
        <div
          style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}
        >
          <span>Pitch</span>
          <span>
            {pitch >= 0 ? '+' : ''}
            {pitch.toFixed(2)}% &nbsp; / &nbsp;
            {effectiveRate.toFixed(4)}x
          </span>
        </div>

        <input
          type="range"
          min={-8}
          max={8}
          step={0.01}
          value={pitch}
          onChange={handleSliderChange}
          style={{ width: '100%' }}
        />

        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button onClick={() => handleNudgePercent(-1)}>−1%</button>
          <button onClick={() => handleNudgePercent(+1)}>+1%</button>

          <button onClick={() => applyPitch(0)} style={{ marginLeft: 'auto' }}>
            Quartz 0%
          </button>
        </div>
      </div>

      {/* Dopo qui aggiungeremo BPM, TAP ecc */}
    </div>
  );
}
