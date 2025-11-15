// PitchLab content script

console.log('[PitchLab] content script loaded');

function findMediaElement() {
  // 1) prova con <video> (YouTube / embedded)
  let media = document.querySelector('video');

  // 2) se non c'è, prova <audio> (Bandcamp ecc.)
  if (!media) {
    media = document.querySelector('audio');
  }

  return media;
}

function createPitchWidget() {
  // evita duplicati
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
  valueSpan.textContent = '1.00';

  const multiplierSpan = document.createElement('span');
  multiplierSpan.textContent = '1.00x';

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

  let currentRate = 1.0;

  function applyRate() {
    const media = findMediaElement();
    if (!media) {
      console.warn('[PitchLab] No media element found on this page');
      return;
    }

    media.playbackRate = currentRate;
    valueSpan.textContent = currentRate.toFixed(2);
    multiplierSpan.textContent = currentRate.toFixed(2) + 'x';
    console.log('[PitchLab] set playbackRate =', currentRate);
  }

  minusBtn.addEventListener('click', () => {
    currentRate = Math.max(0.50, currentRate - 0.01); // passi di 1%
    applyRate();
  });

  plusBtn.addEventListener('click', () => {
    currentRate = Math.min(1.50, currentRate + 0.01);
    applyRate();
  });

  // rate iniziale
  applyRate();
}

// DOM pronto → crea widget
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[PitchLab] DOMContentLoaded');
    createPitchWidget();
  });
} else {
  createPitchWidget();
}
