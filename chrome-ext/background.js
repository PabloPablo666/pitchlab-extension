console.log('[PitchLab] background ready');

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('ui-panel/index.html'),
  });
});
