// popup/popup.js

document.addEventListener('DOMContentLoaded', async () => {
  const settingsBtn = document.getElementById('settingsBtn');
  const jobsCountEl = document.getElementById('jobsCount');
  const aiCountEl = document.getElementById('aiCount');

  // Open settings
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Load stats from storage
  // Assuming we track these in background. In this simplified version, we'll just check log length.
  const STORAGE_KEYS = {
    REQUEST_LOG: 'ujm_request_log'
  };

  try {
    const data = await chrome.storage.local.get(STORAGE_KEYS.REQUEST_LOG);
    const log = data[STORAGE_KEYS.REQUEST_LOG] || [];
    
    jobsCountEl.textContent = log.length;
    
    const aiAnalyzed = log.filter(entry => entry.llmScore !== null).length;
    aiCountEl.textContent = aiAnalyzed;
  } catch (e) {
    jobsCountEl.textContent = '0';
    aiCountEl.textContent = '0';
  }
});
