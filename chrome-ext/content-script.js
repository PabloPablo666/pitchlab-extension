console.log('[PitchLab] content script loaded');

// stato interno
let currentRate = 1.0;
let mediaElement = null;

// -----------------------------------------
// Trova in loop finché non appare un media
// -----------------------------------------
function findMediaLoop() {
  if (mediaElement && !mediaElement.paused) return;  

  const video = document.querySelector('video');
  const audio = document.querySelector('audio');

  mediaElement = video || audio;

  if (mediaElement) {
    console.log('[PitchLab] Media found:', mediaElement.tagName);
    applyRate();
  } else {
    console.log('[PitchLab] Retrying media search...');
    setTimeout(findMediaLoop, 500);
  }
}
findMediaLoop();

// -----------------------------------------
function applyRate() {
  if (!mediaElement) return;
  mediaElement.playbackRate = currentRate;
  console.log('[PitchLab] playbackRate =', currentRate);
}

// -----------------------------------------
// Aggiorna rate dal pannello
// -----------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;

  switch (msg.type) {

    case 'PITCHLAB_SET_RATE': {
      currentRate = msg.rate;
      applyRate();
      sendResponse?.({ ok: true, rate: currentRate });
      return true;
    }

    case 'PITCHLAB_NUDGE_RATE': {
      currentRate += msg.delta;
      applyRate();
      sendResponse?.({ ok: true, rate: currentRate });
      return true;
    }

    default:
      return;
  }
});

// -----------------------------------------
// Mini widget (rimane identico)
// -----------------------------------------
function createPitchWidget() {
  if (document.getElementById('pitchlab-floating-widget')) return;

  const box = document.createElement('div');
  box.id = 'pitchlab-floating-widget';
  box.style.position = 'fixed';
  box.style.bottom = '16px';
  box.style.right = '16px';
  box.style.zIndex = '999999';
  box.style.padding = '6px 10px';
  box.style.background = 'rgba(0,0,0,0.85)';
  box.style.color = '#fff';
  box.style.borderRadius = '4px';
  box.style.fontFamily = 'system-ui';
  box.style.display = 'flex';
  box.style.gap = '8px';
  box.style.alignItems = 'center';

  const minus = document.createElement('button');
  minus.textContent = '−';
  minus.onclick = () => {
    currentRate = Math.max(0.5, currentRate - 0.01);
    applyRate();
  };

  const plus = document.createElement('button');
  plus.textContent = '+';
  plus.onclick = () => {
    currentRate = Math.min(1.5, currentRate + 0.01);
    applyRate();
  };

  const label = document.createElement('span');
  label.id = 'pitchlab-widget-value';
  label.textContent = currentRate.toFixed(2);

  box.appendChild(minus);
  box.appendChild(label);
  box.appendChild(plus);

  document.body.appendChild(box);

  setInterval(() => {
    label.textContent = currentRate.toFixed(2);
  }, 100);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createPitchWidget);
} else {
  createPitchWidget();
}
