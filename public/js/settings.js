document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('pictionaryToggle');
  const messageDiv = document.getElementById('message');

  // Fetch current settings from the backend
  fetch('/settings/api')
    .then(response => response.json())
    .then(data => {
      // Default to "1" (enabled) if not set
      toggle.checked = (data.pictionaryEnabled === "1");
    })
    .catch(err => console.error('Error fetching settings:', err));

  // Listen for toggle changes
  toggle.addEventListener('change', () => {
    const newSetting = toggle.checked ? "1" : "0";

    fetch('/settings/api/pictionary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pictionaryEnabled: newSetting })
    })
    .then(response => response.json())
    .then(data => {
      const message = newSetting === "1" ?
        'Vanaf volgend potje doe je mee' :
        'Vanaf volgend potje doe je niet mee';
      messageDiv.textContent = message;
      // Clear the message after 3 seconds
      setTimeout(() => messageDiv.textContent = '', 3000);
    })
    .catch(err => {
      console.error('Error updating setting:', err);
      messageDiv.textContent = 'Er is een fout opgetreden.';
      setTimeout(() => messageDiv.textContent = '', 3000);
    });
  });
});