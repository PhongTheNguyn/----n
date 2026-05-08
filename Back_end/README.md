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

## Billing and payment APIs

- `GET /api/user/billing-summary`: coin balance + free call minutes left in current day.
- `GET /api/user/coin-transactions`: latest coin transactions.
- `POST /api/admin/topup-coins`: admin test topup `{ userId, coins }`.
- `POST /api/payment/zalopay/create`: create ZaloPay payment link `{ coins }`.
- `POST /api/payment/zalopay/callback`: ZaloPay callback to confirm payment and add coins.
- `POST /api/payment/zalopay/:orderId/query`: query order status from ZaloPay.

### ZaloPay environment variables

Set these variables in backend `.env` before using ZaloPay:

- `ZALOPAY_APP_ID`
- `ZALOPAY_KEY1`
- `ZALOPAY_KEY2`
- `ZALOPAY_CREATE_ENDPOINT` (default sandbox gateway)
- `ZALOPAY_QUERY_ENDPOINT`
- `ZALOPAY_REDIRECT_URL`
- `ZALOPAY_CALLBACK_URL`
