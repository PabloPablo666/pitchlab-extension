console.log('[PitchLab bg] service worker started');

// Clic sull'icona → apre il pannello UI
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('ui-panel/index.html'),
  });
});

// Messaggi che arrivano dal pannello (React)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'SET_RATE') return;

  const rate = parseFloat(msg.value);
  if (Number.isNaN(rate)) {
    console.warn('[PitchLab bg] invalid rate from panel', msg.value);
    return;
  }

  console.log('[PitchLab bg] forwarding rate to active tab:', rate);

  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const tab = tabs[0];
    if (!tab || !tab.id) {
      console.warn('[PitchLab bg] no active tab');
      return;
    }

    chrome.tabs.sendMessage(
      tab.id,
      { type: 'APPLY_RATE', value: rate },
      response => {
        if (chrome.runtime.lastError) {
          console.warn(
            '[PitchLab bg] sendMessage error',
            chrome.runtime.lastError.message
          );
        } else {
          console.log('[PitchLab bg] tab responded:', response);
        }
      }
    );
  });
});
