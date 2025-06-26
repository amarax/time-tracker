// popup.js
chrome.tabs.query({active: true, lastFocusedWindow: true}, (tabs) => {
  const tab = tabs[0];
  document.getElementById('tab-info').textContent = tab ? `${tab.title} - ${tab.url}` : 'No active tab';
});
