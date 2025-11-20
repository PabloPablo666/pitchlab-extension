// PitchLab content script
// - trova il media element nella pagina
// - applica playbackRate direttamente (senza smoothing JS)
// - espone una piccola API per il pannello
// - mantiene il mini widget in basso a destra

console.log('[PitchLab] content script loaded');

let currentRate = 1.0;

// Riferimenti al mini widget
const widget = {
  container: null,
  valueSpan: null,
};

// ------------------------------
// Helpers
// ------------------------------

function findMediaElement() {
  // Priorità: <video> (YouTube, embed Discogs)
  let media = document.querySelector('video');

  // Fallback: <audio> (Bandcamp, player vecchi)
  if (!media) {
    media = document.querySelector('audio');
  }

  return media || null;
}

function clampRate(rate) {
  const min = 0.5;
  const max = 1.5;
  if (!Number.isFinite(rate)) return currentRate;
  return Math.min(max, Math.max(min, rate));
}

function applyRate() {
  const media = findMediaElement();
  if (!media) {
    console.warn('[PitchLab] No media element found on this page');
    return;
  }

  media.playbackRate = currentRate;

  if (widget.valueSpan) {
    widget.valueSpan.textContent = currentRate.toFixed(2);
  }

  // console.log('[PitchLab] playbackRate set to', currentRate);
}

function setRateFromPanel(rate) {
  currentRate = clampRate(rate);
  applyRate();
}

function nudgeRate(delta) {
  const d = Number(delta) || 0;
  currentRate = clampRate(currentRate + d);
  applyRate();
}

// ------------------------------
// Messaging API per il pannello
// ------------------------------
//
// Messaggi supportati:
//  - { type: 'PITCHLAB_SET_RATE', rate: number }
//  - { type: 'PITCHLAB_NUDGE_RATE', delta: number }
//  - { type: 'PITCHLAB_GET_STATE' }

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    return;
  }

  switch (message.type) {
    case 'PITCHLAB_SET_RATE': {
      setRateFromPanel(message.rate);
      sendResponse?.({
        ok: true,
        rate: currentRate,
      });
      return true;
    }

    case 'PITCHLAB_NUDGE_RATE': {
      nudgeRate(message.delta);
      sendResponse?.({
        ok: true,
        rate: currentRate,
      });
      return true;
    }

    case 'PITCHLAB_GET_STATE': {
      const media = findMediaElement();
      sendResponse?.({
        ok: true,
        rate: currentRate,
        hasMedia: !!media,
        duration: media ? media.duration : null,
        currentTime: media ? media.currentTime : null,
      });
      return true;
    }

    default:
      // non è un messaggio nostro
      return;
  }
});

// ------------------------------
// Mini widget in basso a destra
// ------------------------------

function createPitchWidget() {
  if (document.getElementById('pitchlab-floating-widget')) return;

  const container = document.createElement('div');
  container.id = 'pitchlab-floating-widget';
  container.style.position = 'fixed';
  container.style.bottom = '16px';
  container.style.right = '16px';
  container.style.zIndex = '999999';
  container.style.background = 'rgba(0,0,0,0.85)';
  container.style.color = '#fff';
  container.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
  container.style.fontSize = '12px';
  container.style.padding = '6px 10px';
  container.style.borderRadius = '4px';
  container.style.display = 'flex';
  container.style.alignItems = 'center';
  container.style.gap = '6px';
  container.style.boxShadow = '0 2px 8px rgba(0,0,0,0.5)';

  const label = document.createElement('span');
  label.textContent = 'PitchLab: rate';

  const minusBtn = document.createElement('button');
  minusBtn.textContent = '−';
  minusBtn.style.minWidth = '20px';

  const plusBtn = document.createElement('button');
  plusBtn.textContent = '+';
  plusBtn.style.minWidth = '20px';

  const valueSpan = document.createElement('span');
  valueSpan.textContent = currentRate.toFixed(2);

  const multiplierSpan = document.createElement('span');
  multiplierSpan.textContent = '×';

  [minusBtn, plusBtn].forEach(btn => {
    btn.style.border = '1px solid #555';
    btn.style.background = '#222';
    btn.style.color = '#fff';
    btn.style.cursor = 'pointer';
    btn.style.borderRadius = '3px';
    btn.style.padding = '0 4px';
  });

  container.appendChild(label);
  container.appendChild(minusBtn);
  container.appendChild(valueSpan);
  container.appendChild(plusBtn);
  container.appendChild(multiplierSpan);

  document.body.appendChild(container);

  widget.container = container;
  widget.valueSpan = valueSpan;

  minusBtn.addEventListener('click', () => {
    nudgeRate(-0.01); // passi di 1%
  });

  plusBtn.addEventListener('click', () => {
    nudgeRate(+0.01);
  });

  // rate iniziale
  currentRate = 1.0;
  applyRate();
}

// Aspetta che il DOM sia pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[PitchLab] DOMContentLoaded, init widget');
    createPitchWidget();
  });
} else {
  createPitchWidget();
}
