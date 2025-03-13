// Background script for AI Texter Chrome extension

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'generateResponse') {
        handleGenerateResponse(request, sendResponse);
        return true; // Will respond asynchronously
    }
});

async function handleGenerateResponse(request, sendResponse) {
    try {
        const { message, brokerEmail, url } = request;

        // Call the AI Texter API
        const response = await fetch('https://ai-texter.onrender.com/training', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                conversation: {
                    broker_email: brokerEmail,
                    phone_number: url, // Using URL as a unique identifier
                    user_message: message,
                    ai_response: '', // Will be filled by the server
                    effectiveness: 0
                }
            })
        });

        if (!response.ok) {
            throw new Error('Failed to generate response');
        }

        const data = await response.json();
        sendResponse(data.ai_response);
    } catch (error) {
        console.error('Error generating response:', error);
        sendResponse({ error: error.message });
    }
} 