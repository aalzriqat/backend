# SmartSwap API

The backend REST API for **SmartSwap**, an intelligent shift-swapping platform. It handles authentication, employee schedules, swap intents, AI-assisted matching, and multi-hop swap-chain detection and execution.

- **Live API:** https://smartswap-api.vercel.app
- **Frontend:** https://smartswap-web.vercel.app ([`aalzriqat/smartswap-scheduler`](https://github.com/aalzriqat/smartswap-scheduler))

## Tech stack

- Node.js + Express + TypeScript
- MongoDB (Mongoose) — hosted on MongoDB Atlas
- JWT authentication + bcrypt password hashing
- Joi request validation, Helmet, CORS, Winston logging
- Deployed to Vercel as a serverless function

## API overview

All routes are prefixed with `/api`.

| Area | Routes |
|------|--------|
| Auth | `POST /auth/login`, `POST /auth/register`, `GET /auth/me`, `POST /auth/logout` |
| Users | `GET /users`, `GET /users/:id`, `PUT /users/:id` |
| Schedules | `GET /real-schedules`, `GET /real-schedules/my-schedule`, `GET /real-schedules/stats` |
| Swap intents | `GET/POST /swap-intents`, `GET /swap-intents/:id/matches` (smart matching) |
| Swap chains | `POST /swap-chains/detect/:intentId`, `POST /swap-chains/:id/approve`, `/reject`, `/execute` |
| Analytics | `GET /analytics` |
| Health | `GET /health` |

Protected routes require an `Authorization: Bearer <token>` header.

## Getting started

```bash
npm install
cp .env.example .env          # set MONGODB_URI, JWT_SECRET
npm run seed:real-schedules   # seed employee schedules
npm run create:demo-users     # create demo logins
npm run dev                   # http://localhost:3001
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret used to sign JWTs |
| `JWT_EXPIRES_IN` | Token lifetime (e.g. `7d`) |
| `PORT` | Local port (default `3001`) |
| `FRONTEND_URL` | Allowed CORS origin |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the API with nodemon |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server |
| `npm run seed:real-schedules` | Import employee schedules |
| `npm run create:demo-users` | Create the demo accounts |

## Deployment

Deployed to Vercel via `api/index.ts`, which wraps the Express app as a serverless function with a cached MongoDB connection. Configure `MONGODB_URI`, `JWT_SECRET`, and related variables in the Vercel project settings.

## License

MIT
