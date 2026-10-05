const socket = io();

document.getElementById('auth-btn').addEventListener('click', async () => {
  const password = document.getElementById('site-password').value;
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('auth-section').classList.add('hidden');
      document.getElementById('app-section').classList.remove('hidden');
    } else {
      alert('Invalid Password');
    }
  } catch (err) {
    alert('Authentication error');
  }
});

document.getElementById('verify-btn').addEventListener('click', async () => {
  const email = document.getElementById('smtp-email').value;
  const appPassword = document.getElementById('smtp-pass').value;
  
  if (!email || !appPassword) {
    alert('Please enter Gmail and App Password');
    return;
  }

  const logBox = document.getElementById('live-log');
  logBox.innerHTML += `<div>Verifying SMTP credentials...</div>`;

  try {
    const res = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, appPassword })
    });
    const data = await res.json();
    if (data.success) {
      logBox.innerHTML += `<div style="color: #34d399;">✔ SMTP Verified Successfully!</div>`;
    } else {
      logBox.innerHTML += `<div style="color: #f87171;">✖ Verification Failed: ${data.message}</div>`;
    }
  } catch (err) {
    logBox.innerHTML += `<div style="color: #f87171;">✖ Network Error during verification</div>`;
  }
  logBox.scrollTop = logBox.scrollHeight;
});

document.getElementById('send-btn').addEventListener('click', async () => {
  const email = document.getElementById('smtp-email').value;
  const appPassword = document.getElementById('smtp-pass').value;
  const senderName = document.getElementById('sender-name').value;
  const subject = document.getElementById('email-subject').value;
  const messageBody = document.getElementById('email-body').value;
  const rawRecipients = document.getElementById('recipients-list').value;

  if (!email || !appPassword || !rawRecipients) {
    alert('Required fields are missing.');
    return;
  }

  const recipients = rawRecipients.split('\n').map(r => r.trim()).filter(r => r.length > 0);
  const logBox = document.getElementById('live-log');
  logBox.innerHTML += `<div>🚀 Starting Campaign for ${recipients.length} recipients...</div>`;

  try {
    const response = await fetch('/api/send-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, appPassword, senderName, subject, messageBody, recipients })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const payloadStr = line.replace('data: ', '').trim();
          if (payloadStr === '[DONE]') {
            logBox.innerHTML += `<div style="color: #38bdf8;">✨ Campaign Completed Successfully.</div>`;
            logBox.scrollTop = logBox.scrollHeight;
            return;
          }
          try {
            const parsed = JSON.parse(payloadStr);
            if (parsed.success) {
              logBox.innerHTML += `<div style="color: #34d399;">✔ Sent to: ${parsed.recipient}</div>`;
            } else if (parsed.error) {
              logBox.innerHTML += `<div style="color: #f87171;">✖ Error: ${parsed.error}</div>`;
            }
          } catch {}
          logBox.scrollTop = logBox.scrollHeight;
        }
      }
    }
  } catch (err) {
    logBox.innerHTML += `<div style="color: #f87171;">✖ Stream interrupted.</div>`;
  }
});

document.getElementById('stop-btn').addEventListener('click', async () => {
  try {
    await fetch('/api/stop', { method: 'POST' });
    const logBox = document.getElementById('live-log');
    logBox.innerHTML += `<div style="color: #fbbf24;">⚠ Campaign stop requested.</div>`;
  } catch {}
});

socket.on('mail_sent', (data) => {
  // Real-time notification support
});

socket.on('mail_error', (data) => {
  // Real-time error monitoring support
});
