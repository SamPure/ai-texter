// Toast notification function
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Trigger reflow
    toast.offsetHeight;
    
    // Show toast
    toast.classList.add('show');
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Fetch and display brokers
async function fetchBrokers() {
    try {
        const response = await fetch('/api/brokers');
        const brokers = await response.json();
        const brokersList = document.getElementById('brokersList');
        
        brokersList.innerHTML = brokers.map(broker => `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm font-medium text-gray-900">${broker.name}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-900">${broker.email}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <label class="status-toggle">
                        <input type="checkbox" ${broker.active ? 'checked' : ''} onchange="toggleBrokerStatus('${broker.id}', this.checked)">
                        <span class="slider"></span>
                    </label>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button onclick="deleteBroker('${broker.id}')" class="text-red-600 hover:text-red-900">Delete</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error fetching brokers:', error);
        showToast('Failed to load brokers', 'error');
    }
}

// Add new broker
document.getElementById('addBrokerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
        name: formData.get('name'),
        email: formData.get('email')
    };
    
    try {
        const response = await fetch('/api/brokers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) throw new Error('Failed to create broker');
        
        showToast('Broker added successfully');
        e.target.reset();
        fetchBrokers();
    } catch (error) {
        console.error('Error adding broker:', error);
        showToast('Failed to add broker', 'error');
    }
});

// Toggle broker status
async function toggleBrokerStatus(id, active) {
    try {
        const response = await fetch(`/api/brokers/${id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ active })
        });
        
        if (!response.ok) throw new Error('Failed to update broker status');
        
        showToast('Broker status updated');
    } catch (error) {
        console.error('Error updating broker status:', error);
        showToast('Failed to update broker status', 'error');
        // Revert the toggle
        fetchBrokers();
    }
}

// Delete broker
async function deleteBroker(id) {
    if (!confirm('Are you sure you want to delete this broker?')) return;
    
    try {
        const response = await fetch(`/api/brokers/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error('Failed to delete broker');
        
        showToast('Broker deleted successfully');
        fetchBrokers();
    } catch (error) {
        console.error('Error deleting broker:', error);
        showToast('Failed to delete broker', 'error');
    }
}

// Initial load
fetchBrokers(); 