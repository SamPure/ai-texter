// Admin Interface JavaScript
const SERVER_URL = 'http://localhost:3001'; // Add server URL

document.addEventListener('DOMContentLoaded', () => {
    console.log('Admin interface initialized');
    
    // Initialize Bootstrap components
    const addBrokerModal = new bootstrap.Modal(document.getElementById('addBrokerModal'));
    const viewConversationModal = new bootstrap.Modal(document.getElementById('viewConversationModal'));

    // Load initial data
    loadBrokers();
    loadConversations();

    // Event Listeners
    const saveButton = document.querySelector('#addBrokerModal .btn-primary');
    if (saveButton) {
        console.log('Found save button, setting up event listener');
        saveButton.addEventListener('click', () => {
            console.log('Save button clicked');
            saveBroker();
        });
    } else {
        console.error('Save button not found');
    }
});

// Broker Management
async function loadBrokers() {
    console.log('Loading brokers...');
    try {
        const response = await fetch(`${SERVER_URL}/brokers`);
        console.log('Load brokers response:', response);
        const brokers = await response.json();
        console.log('Brokers loaded:', brokers);
        const brokersList = document.getElementById('brokers-list');
        brokersList.innerHTML = '';

        brokers.forEach(broker => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${broker.email}</td>
                <td>${broker.name}</td>
                <td>
                    <span class="badge ${broker.active ? 'bg-success' : 'bg-danger'}">
                        ${broker.active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm ${broker.active ? 'btn-warning' : 'btn-success'}" 
                            onclick="toggleBrokerStatus(${broker.id}, ${!broker.active})">
                        ${broker.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteBroker(${broker.id})">
                        Delete
                    </button>
                </td>
            `;
            brokersList.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading brokers:', error);
        showError('Failed to load brokers');
    }
}

async function saveBroker() {
    console.log('saveBroker function called');
    const email = document.getElementById('broker-email').value;
    const name = document.getElementById('broker-name').value;

    console.log('Form values:', { email, name });

    if (!email || !name) {
        console.error('Missing required fields');
        showError('Please fill in both email and name fields');
        return;
    }

    try {
        console.log('Sending broker data to server');
        const response = await fetch(`${SERVER_URL}/brokers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, name })
        });

        console.log('Server response status:', response.status);
        const data = await response.json();
        console.log('Server response data:', data);

        if (!response.ok) {
            throw new Error(data.error || data.details || 'Failed to save broker');
        }
        
        // Close modal and refresh list
        const modal = bootstrap.Modal.getInstance(document.getElementById('addBrokerModal'));
        if (modal) {
            modal.hide();
        }
        document.getElementById('add-broker-form').reset();
        loadBrokers();
        showSuccess('Broker added successfully');
    } catch (error) {
        console.error('Error saving broker:', error);
        showError(error.message);
    }
}

async function toggleBrokerStatus(id, active) {
    try {
        const response = await fetch(`${SERVER_URL}/brokers/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ active })
        });

        if (!response.ok) throw new Error('Failed to update broker status');
        showSuccess('Broker status updated');
    } catch (error) {
        showError('Failed to update broker status');
        // Revert checkbox state
        event.target.checked = !active;
    }
}

async function deleteBroker(id) {
    if (!confirm('Are you sure you want to delete this broker?')) return;

    try {
        const response = await fetch(`${SERVER_URL}/brokers/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete broker');
        
        loadBrokers();
        showSuccess('Broker deleted successfully');
    } catch (error) {
        showError('Failed to delete broker');
    }
}

// Conversation Management
async function loadConversations() {
    try {
        const response = await fetch(`${SERVER_URL}/conversations`);
        const conversations = await response.json();
        const conversationsList = document.getElementById('conversations-list');
        conversationsList.innerHTML = '';

        conversations.forEach(conv => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${new Date(conv.created_at).toLocaleString()}</td>
                <td>${conv.broker_email}</td>
                <td>${conv.phone_number}</td>
                <td>${conv.effectiveness || 'N/A'}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="viewConversation(${conv.id})">View</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteConversation(${conv.id})">Delete</button>
                </td>
            `;
            conversationsList.appendChild(row);
        });
    } catch (error) {
        showError('Failed to load conversations');
    }
}

async function viewConversation(id) {
    try {
        const response = await fetch(`${SERVER_URL}/conversations/${id}`);
        const conversation = await response.json();
        
        const details = document.getElementById('conversation-details');
        details.innerHTML = `
            <div class="conversation-messages">
                ${conversation.messages.map(msg => `
                    <div class="message ${msg.role} mb-3">
                        <strong>${msg.role === 'user' ? 'User' : 'AI'}:</strong>
                        <p class="mb-0">${msg.content}</p>
                    </div>
                `).join('')}
            </div>
        `;
        
        viewConversationModal.show();
    } catch (error) {
        showError('Failed to load conversation details');
    }
}

async function deleteConversation(id) {
    if (!confirm('Are you sure you want to delete this conversation?')) return;

    try {
        const response = await fetch(`${SERVER_URL}/conversations/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete conversation');
        
        loadConversations();
        showSuccess('Conversation deleted successfully');
    } catch (error) {
        showError('Failed to delete conversation');
    }
}

// Utility Functions
function showError(message) {
    const alert = document.createElement('div');
    alert.className = 'alert alert-danger alert-dismissible fade show';
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.querySelector('.container').insertBefore(alert, document.querySelector('.section'));
    setTimeout(() => alert.remove(), 5000);
}

function showSuccess(message) {
    const alert = document.createElement('div');
    alert.className = 'alert alert-success alert-dismissible fade show';
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.querySelector('.container').insertBefore(alert, document.querySelector('.section'));
    setTimeout(() => alert.remove(), 5000);
}
