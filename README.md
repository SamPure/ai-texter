# AI Texter

An AI-powered SMS response system integrated with Kixie and OpenAI, designed for automated broker communications.

## Features

- Automated SMS responses using OpenAI's GPT models
- Integration with Kixie for SMS handling
- Broker management system
- Conversation history tracking
- Real-time webhook processing
- Email reporting system
- Web interface for message monitoring
- Chrome extension for enhanced functionality

## Prerequisites

- Node.js >= 18.0.0
- Supabase account
- OpenAI API key
- Kixie API credentials

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with the following variables:
   ```
   PORT=3001
   NODE_ENV=development
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   OPENAI_API_KEY=your_openai_api_key
   KIXIE_API_KEY=your_kixie_api_key
   KIXIE_BUSINESS_ID=your_kixie_business_id
   ```

## Running the Application

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## Testing

Run the test suite:
```bash
npm test
```

## API Endpoints

- `POST /webhook` - Receives SMS webhooks from Kixie
- `GET /api/conversations` - Retrieves conversation history
- `GET /api/brokers` - Lists all brokers
- `POST /api/brokers/bulk` - Bulk adds/updates brokers
- `GET /messages` - Web interface for message monitoring
- `GET /webhook-docs` - API documentation

## Chrome Extension

The Chrome extension enhances the functionality by:
- Adding context menu options for quick responses
- Providing broker information overlay
- Enabling quick access to conversation history

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

ISC License 