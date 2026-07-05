document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('pictionaryToggle');
  const wieBenIkToggle = document.getElementById('wieBenIkToggle');
  const messageDiv = document.getElementById('message');

  // Fetch current settings from the backend
  fetch('/settings/api')
    .then(response => response.json())
    .then(data => {
      // Default to "1" (enabled) if not set
      toggle.checked = (data.pictionaryEnabled === "1");
      wieBenIkToggle.checked = (data.wieBenIkEnabled === "1");
    })
    .catch(err => console.error('Error fetching settings:', err));

  function showMessage(text) {
    messageDiv.textContent = text;
    setTimeout(() => messageDiv.textContent = '', 3000);
  }

  // Listen for pictionary toggle changes
  toggle.addEventListener('change', () => {
    const newSetting = toggle.checked ? "1" : "0";

    fetch('/settings/api/pictionary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pictionaryEnabled: newSetting })
    })
    .then(response => response.json())
    .then(data => {
      showMessage(newSetting === "1" ?
        'Vanaf volgend potje doe je mee' :
        'Vanaf volgend potje doe je niet mee');
    })
    .catch(err => {
      console.error('Error updating setting:', err);
      showMessage('Er is een fout opgetreden.');
    });
  });

  // Listen for wie ben ik toggle changes
  wieBenIkToggle.addEventListener('change', () => {
    const newSetting = wieBenIkToggle.checked ? "1" : "0";

    fetch('/settings/api/wie-ben-ik', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wieBenIkEnabled: newSetting })
    })
    .then(response => response.json())
    .then(data => {
      showMessage(newSetting === "1" ?
        'Vanaf volgend potje doe je mee' :
        'Vanaf volgend potje doe je niet mee');
    })
    .catch(err => {
      console.error('Error updating setting:', err);
      showMessage('Er is een fout opgetreden.');
    });
  });
});
