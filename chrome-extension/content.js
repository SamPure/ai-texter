// Content script for AI Texter Chrome extension

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getPageContent') {
        // Get the current page content
        const content = document.body.innerText;
        sendResponse({ content });
    }
});

// Add a small floating button to the page
function addFloatingButton() {
    const button = document.createElement('button');
    button.innerHTML = '🤖 AI Texter';
    button.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 10000;
        padding: 10px 20px;
        background-color: #0d6efd;
        color: white;
        border: none;
        border-radius: 20px;
        cursor: pointer;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    `;
    button.addEventListener('click', () => {
        // Open the extension popup
        chrome.runtime.sendMessage({ action: 'openPopup' });
    });
    document.body.appendChild(button);
}

// Add the floating button when the page loads
addFloatingButton(); 