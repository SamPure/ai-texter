require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function testConnection() {
  try {
    console.log('Testing Supabase connection...');
    const { data: insertData, error: insertError } = await supabase
      .from('conversations')
      .insert([{
        phone_number: '+1234567890',
        broker_email: 'test@example.com',
        user_message: 'Test message',
        ai_response: 'Test response'
      }]);

    if (insertError) {
      console.error('❌ Insert Error:', insertError);
      return;
    }

    console.log('✅ Insert successful');

    const { data: selectData, error: selectError } = await supabase
      .from('conversations')
      .select('*')
      .limit(1);

    if (selectError) {
      console.error('❌ Select Error:', selectError);
      return;
    }

    console.log('✅ Select successful');
    console.log('Latest record:', selectData[0]);

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testConnection();