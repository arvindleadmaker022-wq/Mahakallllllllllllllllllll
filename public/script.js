document.addEventListener('DOMContentLoaded', () => {
    const passwordGate = document.getElementById('password-gate');
    const mainApp = document.getElementById('main-app');
    const gateForm = document.getElementById('gate-form');
    const gatePassword = document.getElementById('gate-password');
    const gateError = document.getElementById('gate-error');
    const logoutBtn = document.getElementById('logout-btn');

    if (sessionStorage.getItem('authenticated') === 'true') {
        passwordGate.classList.add('hidden');
        mainApp.classList.remove('hidden');
    }

    gateForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = gatePassword.value.trim();
        try {
            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            const result = await res.json();
            if (result.success) {
                sessionStorage.setItem('authenticated', 'true');
                passwordGate.classList.add('hidden');
                mainApp.classList.remove('hidden');
            } else {
                gateError.classList.remove('hidden');
            }
        } catch (err) {
            gateError.textContent = 'Connection error';
            gateError.classList.remove('hidden');
        }
    });

    logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('authenticated');
        window.location.reload();
    });

    const dashboardEmail = document.getElementById('dashboard-email');
    const dashboardPassword = document.getElementById('dashboard-password');
    const senderName = document.getElementById('sender-name');
    const subject = document.getElementById('subject');
    const messageBody = document.getElementById('message-body');
    const recipientsInput = document.getElementById('recipients-input');
    const detectedCount = document.getElementById('detected-count');
    const emailValidationError = document.getElementById('email-validation-error');
    
    const statTotal = document.getElementById('stat-total');
    const statSent = document.getElementById('stat-sent');
    const statusText = document.getElementById('status-text');
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');

    let extractedEmails = [];
    let isSending = false;
    let stopRequested = false;

    recipientsInput.addEventListener('input', () => {
        const text = recipientsInput.value;
        const matches = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi) || [];
        extractedEmails = [...new Set(matches.map(e => e.toLowerCase().trim()))];
        detectedCount.textContent = `${extractedEmails.length} found`;
        if (extractedEmails.length > 0) emailValidationError.classList.add('hidden');
    });

    sendBtn.addEventListener('click', async () => {
        if (isSending) return;
        const emailVal = dashboardEmail.value.trim();
        const appPasswordVal = dashboardPassword.value.trim();
        const senderNameVal = senderName.value.trim();
        const subjectVal = subject.value.trim();
        const messageBodyVal = messageBody.value.trim();

        if (!emailVal || !appPasswordVal || !senderNameVal || !subjectVal || !messageBodyVal || extractedEmails.length === 0) {
            alert('Please fill out all fields and provide recipients.');
            return;
        }

        sendBtn.disabled = true;
        sendBtn.textContent = 'Verifying...';

        try {
            const verifyRes = await fetch('/api/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: emailVal, appPassword: appPasswordVal })
            });
            const verifyResult = await verifyRes.json();
            if (!verifyResult.success) {
                alert(verifyResult.message || 'SMTP Auth Failed');
                sendBtn.disabled = false;
                sendBtn.textContent = 'Send All';
                return;
            }

            isSending = true;
            stopRequested = false;
            statTotal.textContent = extractedEmails.length;
            statSent.textContent = '0';
            statusText.textContent = 'Sending...';
            sendBtn.classList.add('hidden');
            stopBtn.classList.remove('hidden');

            let sentCount = 0;
            const response = await fetch('/api/send-stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: emailVal,
                    appPassword: appPasswordVal,
                    senderName: senderNameVal,
                    subject: subjectVal,
                    messageBody: messageBodyVal,
                    recipients: extractedEmails
                })
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                if (stopRequested) break;
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.replace('data: ', '').trim();
                        if (dataStr === '[DONE]') break;
                        try {
                            const event = JSON.parse(dataStr);
                            if (event.success) {
                                sentCount++;
                                statSent.textContent = sentCount;
                                statusText.textContent = `Sent to: ${event.recipient}`;
                            }
                        } catch (e) {}
                    }
                }
            }

            statusText.textContent = 'Finished Successfully!';
        } catch (err) {
            alert('Error during transmission.');
        } finally {
            isSending = false;
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send All';
            sendBtn.classList.remove('hidden');
            stopBtn.classList.add('hidden');
        }
    });

    stopBtn.addEventListener('click', async () => {
        stopRequested = true;
        statusText.textContent = 'Stopping...';
        await fetch('/api/stop', { method: 'POST' });
    });
});
