// PitchLab content script
// - gira in TUTTI i frame (manifest all_frames: true)
// - trova i media element nel frame corrente
// - applica playbackRate direttamente (senza smoothing JS)
// - disabilita pitch correction (preservesPitch=false & co.)
// - espone API per il pannello
// - mini widget SOLO nel top frame (window === window.top)

console.log('[PitchLab] content script loaded in frame:', window.location.href);

let currentRate = 1.0;
const isTopFrame = (window === window.top);

// ------------------------------
// Mini widget refs (solo top frame)
// ------------------------------

const widget = {
  container: null,
  valueSpan: null,
};

// ------------------------------
// Helpers
// ------------------------------

function findMediaElements() {
  const videos = Array.from(document.querySelectorAll('video'));
  const audios = Array.from(document.querySelectorAll('audio'));
  return [...videos, ...audios];
}

// disattiva pitch correction (comportamento “vinile”)
function configureMediaLikeDeck(media) {
  const anyMedia = /** @type {any} */ (media);

  if ('preservesPitch' in anyMedia) {
    anyMedia.preservesPitch = false;
  }
  if ('mozPreservesPitch' in anyMedia) {
    anyMedia.mozPreservesPitch = false;
  }
  if ('webkitPreservesPitch' in anyMedia) {
    anyMedia.webkitPreservesPitch = false;
  }
}

function clampRate(rate) {
  const min = 0.5;
  const max = 1.5;
  if (!Number.isFinite(rate)) return currentRate;
  return Math.min(max, Math.max(min, rate));
}

// applica rate a tutti i media del FRAME corrente
function applyRate() {
  const mediaEls = findMediaElements();

  if (!mediaEls.length) {
    // solo log nel frame che non ha media
    console.warn('[PitchLab] No media element found in this frame:', window.location.href);
    return;
  }

  mediaEls.forEach(media => {
    configureMediaLikeDeck(media);      // disabilita pitch correction
    media.playbackRate = currentRate;   // applica rate
  });

  if (isTopFrame && widget.valueSpan) {
    widget.valueSpan.textContent = currentRate.toFixed(2);
  }

  // console.log('[PitchLab] applyRate in frame', window.location.href, 'rate=', currentRate);
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
//
// Il pannello manda il messaggio al TAB, e TUTTI i frame
// che hanno questo content script lo ricevono.
// Ogni frame:
//  - applica il rate sui propri media
//  - risponde SOLO se ha almeno un media element

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return;

  switch (message.type) {
    case 'PITCHLAB_SET_RATE': {
      setRateFromPanel(message.rate);

      // rispondi solo se in questo frame ci sono media
      const mediaEls = findMediaElements();
      if (mediaEls.length > 0) {
        sendResponse?.({
          ok: true,
          rate: currentRate,
          frameUrl: window.location.href,
          mediaCount: mediaEls.length,
        });
        return true;
      }
      return;

    }

    case 'PITCHLAB_NUDGE_RATE': {
      nudgeRate(message.delta);

      const mediaEls = findMediaElements();
      if (mediaEls.length > 0) {
        sendResponse?.({
          ok: true,
          rate: currentRate,
          frameUrl: window.location.href,
          mediaCount: mediaEls.length,
        });
        return true;
      }
      return;
    }

    case 'PITCHLAB_GET_STATE': {
      const mediaEls = findMediaElements();
      const first = mediaEls[0] || null;

      if (mediaEls.length > 0) {
        sendResponse?.({
          ok: true,
          rate: currentRate,
          hasMedia: true,
          frameUrl: window.location.href,
          mediaCount: mediaEls.length,
          duration: first ? first.duration : null,
          currentTime: first ? first.currentTime : null,
        });
        return true;
      } else {
        // nessun media in questo frame → niente risposta,
        // lasciamo che risponda un altro frame che ne ha
        return;
      }
    }

    default:
      return;
  }
});

// ------------------------------
// Mini widget (solo top frame)
// ------------------------------

function createPitchWidget() {
  if (!isTopFrame) {
    // niente widget negli iframe
    return;
  }

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

  // Nudge a passi di 0.01x
  minusBtn.addEventListener('click', () => nudgeRate(-0.01));
  plusBtn.addEventListener('click', () => nudgeRate(+0.01));

  // rate iniziale
  currentRate = 1.0;
  applyRate();
}

// ------------------------------
// Init
// ------------------------------

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    createPitchWidget();
  });
} else {
  createPitchWidget();
}

