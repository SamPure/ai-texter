document.addEventListener('DOMContentLoaded', () => {
    const messageInput = document.getElementById('message');
    const sendButton = document.getElementById('send');
    const loadingDiv = document.getElementById('loading');
    const statusDiv = document.getElementById('status');

    // Load saved broker email
    chrome.storage.local.get(['brokerEmail'], (result) => {
        if (result.brokerEmail) {
            messageInput.placeholder = `Type your message as ${result.brokerEmail}...`;
        }
    });

    sendButton.addEventListener('click', async () => {
        const message = messageInput.value.trim();
        if (!message) return;

        // Show loading state
        loadingDiv.style.display = 'block';
        statusDiv.style.display = 'none';
        sendButton.disabled = true;

        try {
            // Get current tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Get broker email from storage
            const { brokerEmail } = await chrome.storage.local.get(['brokerEmail']);
            if (!brokerEmail) {
                throw new Error('Please set your broker email in the extension settings');
            }

            // Send message to background script
            const response = await chrome.runtime.sendMessage({
                action: 'generateResponse',
                message,
                brokerEmail,
                url: tab.url
            });

            // Show success message
            showStatus('Response generated successfully!', 'success');
            
            // Copy response to clipboard
            await navigator.clipboard.writeText(response);
            showStatus('Response copied to clipboard!', 'success');
        } catch (error) {
            showStatus(error.message, 'error');
        } finally {
            // Reset UI
            loadingDiv.style.display = 'none';
            sendButton.disabled = false;
            messageInput.value = '';
        }
    });

    function showStatus(message, type) {
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        statusDiv.style.display = 'block';
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 3000);
    }
}); 