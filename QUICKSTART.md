# Quick Start Guide - Icon Radar Auth Service

Get the auth service running in under 5 minutes.

## Prerequisites

- Node.js 18+
- PostgreSQL 15+
- npm or yarn

## 1. Install Dependencies

```bash
cd /Users/cope/IconRadar/icon-radar-auth-service
npm install
```

## 2. Set Up Environment

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# Minimum required configuration
PORT=3001
DATABASE_URL=postgresql://user:password@localhost:5432/iconradar
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-this
FRONTEND_URL=http://localhost:5173

# Optional: Email (set EMAIL_ENABLED=false to skip)
EMAIL_ENABLED=false
```

## 3. Set Up Database

```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate
```

## 4. Start Development Server

```bash
npm run dev
```

The service will be available at `http://localhost:3001`.

## 5. Test the Service

### Health Check
```bash
curl http://localhost:3001/health
```

### Register a User
```bash
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Password123!",
    "name": "Test User"
  }'
```

### Login
```bash
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Password123!"
  }'
```

Save the `accessToken` from the response for authenticated requests.

### Get Profile (Authenticated)
```bash
curl http://localhost:3001/api/v1/auth/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Run Tests

```bash
npm test
```

## Build for Production

```bash
npm run build
npm start
```

## Docker Deployment

```bash
docker build -t icon-radar-auth-service .
docker run -p 3001:3001 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="your-secret" \
  icon-radar-auth-service
```

## Common Issues

### Database Connection Error
- Check PostgreSQL is running
- Verify DATABASE_URL is correct
- Ensure database exists

### Port Already in Use
- Change PORT in .env
- Kill process using port 3001: `lsof -ti:3001 | xargs kill`

### Email Not Sending
- Set `EMAIL_ENABLED=false` to disable emails
- Check SMTP credentials if enabled

## Next Steps

1. Review [README.md](./README.md) for complete API documentation
2. Review [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) for architecture details
3. Configure email service for production
4. Set up monitoring and logging
5. Deploy to Railway or Docker

## Support

For issues, check:
- [README.md](./README.md) - Full documentation
- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - Architecture details
- Environment variables in `.env.example`
