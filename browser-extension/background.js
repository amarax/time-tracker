// background.js
// Listens for messages from the node process (via native messaging or polling)
// Responds with the active tab's URL and title if browser is focused

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_ACTIVE_TAB') {
    chrome.tabs.query({active: true, lastFocusedWindow: true}, (tabs) => {
      const tab = tabs[0];
      sendResponse({
        url: tab?.url || '',
        title: tab?.title || ''
      });
    });
    return true; // async response
  }
});
