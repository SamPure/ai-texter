// Initialize Supabase client
let supabase;

async function initSupabase() {
    try {
        // Use the global initializeSupabase function defined in messages.html
        if (window.initializeSupabase) {
            console.log('Using global initializeSupabase function');
            supabase = await window.initializeSupabase();
            return supabase;
        }
        
        // Fallback to our own implementation if the global function doesn't exist
        if (window.supabaseClient) {
            supabase = window.supabaseClient;
            console.log('✓ Using existing Supabase client');
            return supabase;
        }
        
        // Check if supabase exists in window
        if (typeof window.supabase === 'undefined') {
            throw new Error('Supabase SDK not found. Please check your network connection and refresh the page.');
        }
        
        // If not, initialize it
        console.log('Initializing new Supabase client...');
        
        // Fetch config as JSON
        const response = await fetch('/supabase-config.js');
        if (!response.ok) {
            throw new Error(`Failed to fetch config: ${response.status} ${response.statusText}`);
        }
        
        const config = await response.json();
        
        // Extract credentials
        const SUPABASE_URL = config.SUPABASE_URL;
        const SUPABASE_ANON_KEY = config.SUPABASE_ANON_KEY;
        
        if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
            throw new Error('Missing Supabase credentials in config');
        }
        
        // Initialize the client
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        
        // Store it globally
        window.supabaseClient = supabase;
        
        console.log('✓ Supabase initialized successfully');
        return supabase;
    } catch (error) {
        console.error('Failed to initialize Supabase:', error);
        
        // Show detailed error information
        let errorMessage = error.message;
        if (window.supabaseLoadError) {
            errorMessage = 'Supabase client failed to load. This could be due to a network issue or a content blocker in your browser.';
        } else if (typeof window.supabase === 'undefined') {
            errorMessage = 'Supabase SDK not found. Please check your network connection and refresh the page.';
        }
        
        document.getElementById('error-container').classList.remove('d-none');
        document.getElementById('error-container').innerHTML = `
            <div class="alert alert-danger">
                <h4>Connection Error</h4>
                <p>Failed to connect to the database: ${errorMessage}</p>
                <button class="btn btn-primary mt-2" onclick="location.reload()">Refresh Page</button>
            </div>
        `;
        throw error;
    }
}

// State management
let currentFilter = '24h';
let currentBroker = 'all';
let searchQuery = '';
let conversations = [];
let brokers = [];

// Initialize the page
async function init() {
    await initSupabase();
    await loadBrokers();
    await loadConversations();
    setupEventListeners();
    updateMetrics();
}

// Event listeners
function setupEventListeners() {
    document.getElementById('time-filter').addEventListener('change', (e) => {
        currentFilter = e.target.value;
        loadConversations();
    });

    document.getElementById('broker-filter').addEventListener('change', (e) => {
        currentBroker = e.target.value;
        filterConversations();
    });

    document.getElementById('search').addEventListener('input', (e) => {
        searchQuery = e.target.value;
        filterConversations();
    });

    document.getElementById('search-btn').addEventListener('click', () => {
        loadConversations();
    });
}

// Load brokers from Supabase
async function loadBrokers() {
    try {
        // Make sure Supabase is initialized
        if (!supabase) {
            await initSupabase();
        }
        
        // Get all brokers
        const { data, error } = await supabase
            .from('brokers')
            .select('*')
            .order('name');
            
        if (error) throw error;
        
        // Store brokers and populate dropdown
        brokers = data || [];
        populateBrokerDropdown(brokers);
    } catch (error) {
        console.error('Error loading brokers:', error);
    }
}

// Populate broker dropdown
function populateBrokerDropdown(brokers) {
    const dropdown = document.getElementById('broker-filter');
    
    // Keep the "All Brokers" option
    dropdown.innerHTML = '<option value="all">All Brokers</option>';
    
    // Add each broker
    brokers.forEach(broker => {
        const option = document.createElement('option');
        option.value = broker.email.toLowerCase();
        option.textContent = broker.name;
        dropdown.appendChild(option);
    });
}

// Load conversations from Supabase
async function loadConversations() {
    // Show loading state
    const loadingEl = document.getElementById('loading');
    loadingEl.classList.remove('d-none');
    
    try {
        // Make sure Supabase is initialized
        if (!supabase) {
            await initSupabase();
            if (!supabase) {
                throw new Error('Failed to initialize Supabase client');
            }
        }
        
        // Prepare query with filters
        const timeFilter = getTimeFilter();
        let query = supabase
            .from('conversations')
            .select('*')
            .order('created_at', { ascending: false });

        if (timeFilter) {
            query = query.gte('created_at', timeFilter);
        }

        if (searchQuery) {
            query = query.or(`user_message.ilike.%${searchQuery}%,ai_response.ilike.%${searchQuery}%`);
        }

        // Execute query
        const { data, error } = await query;
        
        if (error) throw error;
        
        // Update state and UI
        conversations = Array.isArray(data) ? data : [];
        console.log(`Loaded ${conversations.length} conversations`);
        filterConversations(); // This will apply the broker filter and display
        updateMetrics();
    } catch (error) {
        console.error('Error loading conversations:', error);
        document.getElementById('error-container').classList.remove('d-none');
        document.getElementById('error-container').innerHTML = `
            <div class="alert alert-danger">
                <h4>Failed to Load Conversations</h4>
                <p>${error.message}</p>
                <button class="btn btn-primary mt-2" onclick="loadConversations()">Retry</button>
            </div>
        `;
    } finally {
        // Hide loading state
        loadingEl.classList.add('d-none');
    }
}

// Filter conversations by broker and display them
function filterConversations() {
    let filtered = [...conversations];
    
    // Apply broker filter if not "all"
    if (currentBroker !== 'all') {
        filtered = filtered.filter(conv => 
            conv.broker_email && conv.broker_email.toLowerCase() === currentBroker
        );
    }
    
    // Apply search filter if present
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(conv => 
            (conv.user_message && conv.user_message.toLowerCase().includes(query)) ||
            (conv.ai_response && conv.ai_response.toLowerCase().includes(query))
        );
    }
    
    // Display filtered conversations
    displayConversations(filtered);
    
    // Update conversation count
    const convCount = document.getElementById('conversation-count');
    if (convCount) {
        convCount.textContent = `Showing ${filtered.length} of ${conversations.length} conversations`;
    }
}

// Display conversations
function displayConversations(conversationsToDisplay) {
    const container = document.getElementById('conversations');
    container.innerHTML = '';

    // Show count of displayed conversations
    const countDiv = document.createElement('div');
    countDiv.id = 'conversation-count';
    countDiv.className = 'mb-3 text-muted';
    countDiv.textContent = `Showing ${conversationsToDisplay.length} of ${conversations.length} conversations`;
    container.appendChild(countDiv);

    // Group conversations by phone number
    const grouped = groupByPhoneNumber(conversationsToDisplay);

    // Display each conversation thread
    Object.entries(grouped).forEach(([key, group]) => {
        const thread = document.createElement('div');
        thread.className = 'conversation-thread';
        
        // Create header with phone number and broker info
        const headerDiv = document.createElement('div');
        headerDiv.className = 'd-flex justify-content-between align-items-center';
        
        const phoneHeader = document.createElement('h5');
        phoneHeader.textContent = formatPhoneNumber(group.phoneNumber);
        headerDiv.appendChild(phoneHeader);
        
        // Add broker name if available (from first message)
        if (group.brokerEmail !== 'unknown') {
            const broker = brokers.find(b => b.email.toLowerCase() === group.brokerEmail);
            
            if (broker) {
                const brokerBadge = document.createElement('span');
                brokerBadge.className = 'badge bg-secondary';
                brokerBadge.textContent = broker.name;
                headerDiv.appendChild(brokerBadge);
            }
        }
        
        thread.appendChild(headerDiv);

        // Add the messages
        group.messages.forEach(msg => {
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${msg.user_message ? 'incoming' : 'outgoing'}`;
            
            const content = document.createElement('div');
            content.textContent = msg.user_message || msg.ai_response;
            messageDiv.appendChild(content);

            const time = document.createElement('div');
            time.className = 'message-time';
            time.textContent = new Date(msg.created_at).toLocaleString();
            messageDiv.appendChild(time);

            // Add feedback buttons for AI responses
            if (!msg.user_message) {
                const feedbackDiv = document.createElement('div');
                feedbackDiv.className = 'message-feedback';
                
                const goodBtn = document.createElement('button');
                goodBtn.innerHTML = '👍';
                goodBtn.className = 'btn btn-sm btn-link';
                goodBtn.onclick = () => rateResponse(msg.id, true);
                
                const badBtn = document.createElement('button');
                badBtn.innerHTML = '👎';
                badBtn.className = 'btn btn-sm btn-link';
                badBtn.onclick = () => rateResponse(msg.id, false);
                
                feedbackDiv.appendChild(goodBtn);
                feedbackDiv.appendChild(badBtn);
                messageDiv.appendChild(feedbackDiv);
            }

            thread.appendChild(messageDiv);
        });

        container.appendChild(thread);
    });

    // Show message if no conversations
    if (conversationsToDisplay.length === 0) {
        const noResults = document.createElement('div');
        noResults.className = 'alert alert-info';
        noResults.textContent = 'No conversations found with the current filters.';
        container.appendChild(noResults);
    }
}

// Rate AI response
async function rateResponse(messageId, isGood) {
    try {
        const { error } = await supabase
            .from('conversations')
            .update({ 
                effectiveness: isGood ? 'good' : 'bad',
                rated_at: new Date().toISOString()
            })
            .eq('id', messageId);

        if (error) throw error;
        
        // Visual feedback
        const emoji = isGood ? '✅' : '❌';
        alert(`Response rated ${emoji}`);
        
        // Reload conversations to show updated state
        await loadConversations();
    } catch (error) {
        console.error('Error rating response:', error);
        alert('Failed to rate response');
    }
}

// Update metrics
function updateMetrics() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayMessages = conversations.filter(c => new Date(c.created_at) >= today).length;
    const responseRate = calculateResponseRate();
    const weekConversations = countUniqueConversations(7);
    const avgResponseTime = calculateAverageResponseTime();
    const effectivenessScore = calculateEffectivenessScore();
    const activeThreads = countActiveThreads();
    const { todayCost, avgCost } = calculateCosts();

    document.getElementById('today-messages').textContent = todayMessages;
    document.getElementById('response-rate').textContent = `${responseRate}%`;
    document.getElementById('week-conversations').textContent = weekConversations;
    document.getElementById('avg-response-time').textContent = `${avgResponseTime}s`;
    document.getElementById('effectiveness-score').textContent = `${effectivenessScore}%`;
    document.getElementById('active-threads').textContent = activeThreads;
    document.getElementById('today-cost').textContent = todayCost.toFixed(2);
    document.getElementById('avg-cost').textContent = avgCost.toFixed(2);
}

// Utility functions
function getTimeFilter() {
    const now = new Date();
    switch (currentFilter) {
        case '24h':
            return new Date(now - 24 * 60 * 60 * 1000).toISOString();
        case '7d':
            return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
        case '30d':
            return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
        default:
            return null;
    }
}

function groupByPhoneNumber(messages) {
    return messages.reduce((acc, msg) => {
        // Handle missing phone number
        const phoneNumber = msg.phone_number || 'unknown';
        const brokerEmail = msg.broker_email ? msg.broker_email.toLowerCase() : 'unknown';
        
        // Create a compound key with phone number and broker email to separate conversations
        // This ensures conversations with the same phone number but different brokers are displayed separately
        const key = `${phoneNumber}_${brokerEmail}`;
        
        if (!acc[key]) {
            acc[key] = {
                phoneNumber: phoneNumber,
                brokerEmail: brokerEmail,
                messages: []
            };
        }
        acc[key].messages.push(msg);
        return acc;
    }, {});
}

function formatPhoneNumber(phoneNumber) {
    if (!phoneNumber || phoneNumber === 'unknown') {
        return 'Unknown Number';
    }
    
    // Clean up the phone number - remove non-digits
    const cleaned = ('' + phoneNumber).replace(/\D/g, '');
    
    // Format based on length
    if (cleaned.length === 10) {
        return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
    } else if (cleaned.length === 11) {
        return cleaned.replace(/(\d{1})(\d{3})(\d{3})(\d{4})/, '$1 ($2) $3-$4');
    } else {
        // Return as-is if we can't format it
        return phoneNumber;
    }
}

function calculateResponseRate() {
    const total = conversations.length;
    const responses = conversations.filter(c => c.ai_response).length;
    return total ? Math.round((responses / total) * 100) : 0;
}

function countUniqueConversations(days) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const recentMessages = conversations.filter(c => new Date(c.created_at) >= cutoff);
    return new Set(recentMessages.map(c => c.phone_number)).size;
}

function calculateAverageResponseTime() {
    // Implementation would require timestamps for both receipt and response
    return 30; // Placeholder
}

function calculateEffectivenessScore() {
    // This could be based on message sentiment analysis, conversation length, etc.
    return 85; // Placeholder
}

function countActiveThreads() {
    const last24Hours = new Date();
    last24Hours.setHours(last24Hours.getHours() - 24);
    const recentMessages = conversations.filter(c => new Date(c.created_at) >= last24Hours);
    return new Set(recentMessages.map(c => c.phone_number)).size;
}

function calculateCosts() {
    // Assuming $0.01 per message for API costs
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMessages = conversations.filter(c => new Date(c.created_at) >= today);
    const todayCost = todayMessages.length * 0.01;
    const avgCost = conversations.length ? (conversations.length * 0.01) / countUniqueConversations(30) : 0;
    
    return { todayCost, avgCost };
}

// Call init when the page loads
window.addEventListener('load', async () => {
    try {
        console.log('Page loaded, initializing...');
        await init();
        console.log('✓ Page initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize page:', error);
        document.getElementById('error-container').classList.remove('d-none');
        document.getElementById('error-container').innerHTML = `
            <div class="alert alert-danger">
                <h4>Failed to Initialize</h4>
                <p>${error.message}</p>
                <button class="btn btn-primary mt-2" onclick="init()">Retry</button>
            </div>
        `;
    }
}); 