# Backend - Video Call Random App

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure `.env`:
   - Copy `.env.example` to `.env` if needed
   - Set `DATABASE_URL` to your PostgreSQL connection string
   - Set `JWT_SECRET` for production

3. Create database and run migrations:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. Start the server:
   ```bash
   npm start
   ```
   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

Server runs on http://localhost:3000 by default.
