// Supabase configuration for client-side
const SUPABASE_URL = 'https://jkteeyafblnqtzcpxxrz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprdGVleWFmYmxucXR6Y3B4eHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE1NjExMTcsImV4cCI6MjA1NzEzNzExN30.VKQBmhjoJPqnyDvBh7JkWQ5ZzfTZ4NOb34PCslDw5Ek';

function createClient(url, key) {
    return supabase.createClient(url, key);
} 