require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

let supabaseClient = null;

async function initializeSupabase() {
    if (supabaseClient) {
        return supabaseClient;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error('Missing Supabase credentials:');
        console.error('- SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
        console.error('- SUPABASE_ANON_KEY:', supabaseKey ? '✓' : '✗');
        throw new Error('Supabase credentials not found in environment');
    }

    try {
        console.log('Initializing Supabase with URL:', supabaseUrl);
        
        // Create the Supabase client
        supabaseClient = createClient(supabaseUrl, supabaseKey, {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true
            }
        });

        // Test connection
        const { data, error } = await supabaseClient
            .from('brokers')
            .select('count')
            .limit(1);

        if (error) throw error;
        console.log('✓ Supabase connection successful');
        return supabaseClient;
    } catch (error) {
        console.error('Failed to initialize Supabase:', error);
        throw error;
    }
}

async function getSupabase() {
    if (!supabaseClient) {
        return initializeSupabase();
    }
    
    try {
        // Test connection with brokers table
        const { error } = await supabaseClient
            .from('brokers')
            .select('count')
            .limit(1);
            
        if (error) {
            console.log('Supabase connection lost, reinitializing...');
            supabaseClient = null;
            return initializeSupabase();
        }
        
        return supabaseClient;
    } catch (error) {
        console.error('Supabase connection error:', error);
        supabaseClient = null;
        return initializeSupabase();
    }
}

module.exports = {
    getSupabase,
    initializeSupabase
}; 