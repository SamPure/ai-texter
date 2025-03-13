require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function setupTables() {
    console.log('Starting database setup...');

    // Create brokers table
    console.log('Checking brokers table...');
    const { data: brokersTable, error: brokersError } = await supabase
        .from('brokers')
        .select('*')
        .limit(1);

    if (brokersError) {
        console.log('Brokers table does not exist, creating...');
        const { error: createBrokersError } = await supabase.rpc('create_brokers_table', {
            sql: `
                CREATE TABLE IF NOT EXISTS brokers (
                    id BIGSERIAL PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    active BOOLEAN DEFAULT true,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
                );
            `
        });

        if (createBrokersError) {
            console.error('Error creating brokers table:', createBrokersError);
            return;
        }
        console.log('Brokers table created successfully');
    } else {
        console.log('Brokers table already exists');
    }

    // Create conversations table
    console.log('Checking conversations table...');
    const { data: conversationsTable, error: conversationsError } = await supabase
        .from('conversations')
        .select('*')
        .limit(1);

    if (conversationsError) {
        console.log('Conversations table does not exist, creating...');
        const { error: createConversationsError } = await supabase.rpc('create_conversations_table', {
            sql: `
                CREATE TABLE IF NOT EXISTS conversations (
                    id BIGSERIAL PRIMARY KEY,
                    broker_email TEXT NOT NULL REFERENCES brokers(email),
                    phone_number TEXT,
                    user_message TEXT NOT NULL,
                    ai_response TEXT NOT NULL,
                    effectiveness INTEGER DEFAULT 0,
                    is_training BOOLEAN DEFAULT false,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
                );
            `
        });

        if (createConversationsError) {
            console.error('Error creating conversations table:', createConversationsError);
            return;
        }
        console.log('Conversations table created successfully');
    } else {
        console.log('Conversations table already exists');
    }

    // Create indexes
    console.log('Creating indexes...');
    const { error: indexError } = await supabase.rpc('create_indexes', {
        sql: `
            CREATE INDEX IF NOT EXISTS idx_brokers_email ON brokers(email);
            CREATE INDEX IF NOT EXISTS idx_conversations_broker_email ON conversations(broker_email);
            CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);
        `
    });

    if (indexError) {
        console.error('Error creating indexes:', indexError);
        return;
    }
    console.log('Indexes created successfully');

    console.log('Database setup completed successfully');
}

setupTables().catch(console.error); 