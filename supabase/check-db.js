require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function checkDatabaseStructure() {
    console.log('=== Checking Database Structure ===');
    
    try {
        // Check brokers table
        console.log('\nChecking brokers table...');
        const { data: brokers, error: brokersError } = await supabase
            .from('brokers')
            .select('*')
            .limit(1);
            
        if (brokersError) {
            console.error('Error checking brokers table:', brokersError);
            if (brokersError.code === '42P01') { // Table doesn't exist
                console.log('Brokers table does not exist. Creating...');
                const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
                const { error: createError } = await supabase.rpc('exec_sql', { sql: schema });
                if (createError) throw createError;
                console.log('Schema applied successfully');
            } else {
                throw brokersError;
            }
        } else {
            console.log('Brokers table exists and is accessible');
        }

        // Check conversations table
        console.log('\nChecking conversations table...');
        const { data: conversations, error: conversationsError } = await supabase
            .from('conversations')
            .select('*')
            .limit(1);
            
        if (conversationsError) {
            console.error('Error checking conversations table:', conversationsError);
            if (conversationsError.code === '42P01') { // Table doesn't exist
                console.log('Conversations table does not exist. Creating...');
                const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
                const { error: createError } = await supabase.rpc('exec_sql', { sql: schema });
                if (createError) throw createError;
                console.log('Schema applied successfully');
            } else {
                throw conversationsError;
            }
        } else {
            console.log('Conversations table exists and is accessible');
        }

        // Check indexes
        console.log('\nChecking indexes...');
        const { data: indexes, error: indexesError } = await supabase
            .from('information_schema.indexes')
            .select('*')
            .in('table_name', ['brokers', 'conversations']);
            
        if (indexesError) {
            console.error('Error checking indexes:', indexesError);
        } else {
            console.log('Indexes found:', indexes.map(idx => idx.index_name).join(', '));
        }

        console.log('\n=== Database Structure Check Completed ===');
    } catch (error) {
        console.error('Error during database check:', error);
        process.exit(1);
    }
}

checkDatabaseStructure(); 