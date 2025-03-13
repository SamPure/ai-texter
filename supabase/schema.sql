-- Create brokers table if it doesn't exist
CREATE TABLE IF NOT EXISTS brokers (
    id BIGSERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create conversations table if it doesn't exist
CREATE TABLE IF NOT EXISTS conversations (
    id BIGSERIAL PRIMARY KEY,
    broker_email TEXT NOT NULL REFERENCES brokers(email),
    phone_number TEXT NOT NULL,
    user_message TEXT NOT NULL,
    ai_response TEXT NOT NULL,
    effectiveness INTEGER DEFAULT 0,
    is_training BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_brokers_email ON brokers(email);
CREATE INDEX IF NOT EXISTS idx_conversations_broker_email ON conversations(broker_email);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);

-- Add RLS (Row Level Security) policies
ALTER TABLE brokers ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Allow all operations on brokers (since this is an admin interface)
CREATE POLICY "Allow all operations on brokers" ON brokers
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Allow all operations on conversations (since this is an admin interface)
CREATE POLICY "Allow all operations on conversations" ON conversations
    FOR ALL
    USING (true)
    WITH CHECK (true); 