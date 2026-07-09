# Icon Radar Auth Service

Authentication and authorization microservice for the Icon Radar platform. Handles user registration, login, JWT token management, password reset, email verification, and session management.

## Features

- User registration with email verification
- Secure login with bcrypt password hashing
- JWT-based authentication with access and refresh tokens
- Token rotation for enhanced security
- Password reset flow with secure tokens
- Email verification system
- Session management with Redis
- Password history tracking (prevents reuse of last 5 passwords)
- Account lockout after failed login attempts
- Rate limiting on sensitive endpoints
- Comprehensive audit logging
- Health check endpoints for monitoring

## Architecture

### Service Responsibilities

- **User Management**: Registration, profile updates, account activation
- **Authentication**: Login, logout, token generation and validation
- **Session Management**: Track active sessions, token rotation
- **Password Management**: Change password, reset password, password history
- **Email Verification**: Send and verify email confirmation links
- **Security**: Rate limiting, account lockout, audit logging

### Technology Stack

- **Runtime**: Node.js 18+ with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL (via Prisma ORM)
- **Cache/Sessions**: Redis (optional)
- **Authentication**: JWT (jsonwebtoken)
- **Password Hashing**: bcrypt
- **Validation**: Zod
- **Email**: Nodemailer (supports SMTP, SendGrid, AWS SES)
- **Testing**: Jest, Supertest
- **Logging**: Winston

## API Endpoints

### Public Endpoints

#### POST /api/v1/auth/register
Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "name": "John Doe" // optional
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "User registered successfully. Please check your email to verify your account.",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "USER",
      "isEmailVerified": false,
      "createdAt": "2026-07-09T..."
    }
  }
}
```

#### POST /api/v1/auth/login
Authenticate user and receive tokens.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "USER",
      "isEmailVerified": true,
      "lastLoginAt": "2026-07-09T..."
    }
  }
}
```

#### POST /api/v1/auth/refresh
Refresh access token using refresh token.

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

#### POST /api/v1/auth/forgot-password
Request password reset email.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "If an account exists with this email, a password reset link has been sent."
}
```

#### POST /api/v1/auth/reset-password
Reset password using token from email.

**Request Body:**
```json
{
  "token": "reset-token-from-email",
  "password": "NewSecurePassword123!"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Password reset successfully. Please login with your new password."
}
```

#### GET /api/v1/auth/verify-email?token={token}
Verify email address using token from email.

**Response (200):**
```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

### Protected Endpoints (Require Authentication)

All protected endpoints require an `Authorization` header:
```
Authorization: Bearer {accessToken}
```

#### POST /api/v1/auth/logout
Logout user and revoke session.

**Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

#### GET /api/v1/auth/profile
Get current user profile.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "USER",
    "isActive": true,
    "isEmailVerified": true,
    "emailVerifiedAt": "2026-07-09T...",
    "lastLoginAt": "2026-07-09T...",
    "createdAt": "2026-07-09T...",
    "updatedAt": "2026-07-09T..."
  }
}
```

#### PATCH /api/v1/auth/profile
Update user profile.

**Request Body:**
```json
{
  "name": "Jane Doe", // optional
  "email": "newemail@example.com" // optional
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "id": "uuid",
    "email": "newemail@example.com",
    "name": "Jane Doe",
    "isEmailVerified": false // reset if email changed
  }
}
```

#### POST /api/v1/auth/change-password
Change user password.

**Request Body:**
```json
{
  "currentPassword": "CurrentPassword123!",
  "newPassword": "NewSecurePassword123!"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

#### POST /api/v1/auth/resend-verification
Resend email verification link.

**Response (200):**
```json
{
  "success": true,
  "message": "Verification email sent. Please check your inbox."
}
```

### Health Check Endpoints

#### GET /health
Comprehensive health check.

**Response (200):**
```json
{
  "status": "healthy",
  "service": "auth-service",
  "timestamp": "2026-07-09T...",
  "uptime": 12345,
  "checks": {
    "database": "connected",
    "email": "connected"
  }
}
```

#### GET /health/ready
Readiness probe for Kubernetes.

#### GET /health/live
Liveness probe for Kubernetes.

## Installation

### Prerequisites

- Node.js 18 or higher
- PostgreSQL 15 or higher
- Redis (optional, for session management)
- SMTP server or email service (Gmail, SendGrid, AWS SES)

### Local Development Setup

1. **Clone the repository**:
```bash
cd /Users/cope/IconRadar/icon-radar-auth-service
```

2. **Install dependencies**:
```bash
npm install
```

3. **Set up environment variables**:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Set up database**:
```bash
# Run migrations
npm run db:migrate

# (Optional) Seed database
npm run db:seed
```

5. **Start development server**:
```bash
npm run dev
```

The service will be available at `http://localhost:3001`.

## Environment Variables

See `.env.example` for all available configuration options.

### Required Variables

- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secret key for access tokens
- `JWT_REFRESH_SECRET`: Secret key for refresh tokens
- `FRONTEND_URL`: Frontend application URL for email links

### Optional Variables

- `PORT`: Service port (default: 3001)
- `NODE_ENV`: Environment (development, production, test)
- `REDIS_URL`: Redis connection string
- `EMAIL_ENABLED`: Enable/disable email sending (default: true)
- `EMAIL_PROVIDER`: Email provider (smtp, sendgrid, ses)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`: SMTP configuration
- `LOG_LEVEL`: Logging level (error, warn, info, debug)

## Database Schema

### User Model
- `id`: UUID primary key
- `email`: Unique email address
- `password`: Bcrypt hashed password
- `name`: User's full name
- `role`: User role (USER, ADMIN, GUEST, API_USER)
- `isActive`: Account active status
- `isEmailVerified`: Email verification status
- `emailVerificationToken`: Token for email verification
- `emailVerificationExpires`: Token expiration
- `lastLoginAt`: Last successful login timestamp
- `loginAttempts`: Failed login counter
- `lockedUntil`: Account lock expiration
- `passwordResetToken`: Token for password reset
- `passwordResetExpires`: Token expiration
- `passwordResetAttempts`: Reset request counter
- `twoFactorSecret`: 2FA secret (future use)
- `twoFactorEnabled`: 2FA status (future use)

### Session Model
- `id`: UUID primary key
- `userId`: Foreign key to User
- `accessToken`: Current access token
- `refreshToken`: Current refresh token
- `accessExpiresAt`: Access token expiration
- `refreshExpiresAt`: Refresh token expiration
- `ipAddress`: Client IP address
- `userAgent`: Client user agent
- `isRevoked`: Session revoked status
- `revokedAt`: Revocation timestamp
- `lastUsedAt`: Last activity timestamp

### PasswordHistory Model
- `id`: UUID primary key
- `userId`: Foreign key to User
- `passwordHash`: Bcrypt hash of previous password
- `createdAt`: When password was used

## Security Features

### Password Requirements
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character (@$!%*?&)

### Account Lockout
- Account locked after 5 failed login attempts
- Lock duration: 15 minutes
- Automatic unlock after duration expires

### Password History
- Last 5 passwords are tracked
- Cannot reuse recent passwords
- Automatic cleanup of old history

### Token Management
- Access tokens: 15 minutes expiration
- Refresh tokens: 7 days expiration
- Token rotation on refresh (old tokens invalidated)
- All sessions revoked on password change

### Rate Limiting
- General API: 100 requests per 15 minutes per IP
- Forgot/reset password: 5 requests per hour per IP
- Failed login attempts tracked per user

## Testing

### Run all tests
```bash
npm test
```

### Run unit tests only
```bash
npm test -- --testPathPattern=unit
```

### Run integration tests only
```bash
npm test -- --testPathPattern=integration
```

### Generate coverage report
```bash
npm run test:coverage
```

### Watch mode
```bash
npm run test:watch
```

## Docker Deployment

### Build Docker image
```bash
docker build -t icon-radar-auth-service .
```

### Run with Docker
```bash
docker run -p 3001:3001 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="your-secret" \
  -e JWT_REFRESH_SECRET="your-refresh-secret" \
  icon-radar-auth-service
```

### Docker Compose
```yaml
version: '3.8'
services:
  auth-service:
    build: .
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/iconradar
      - JWT_SECRET=${JWT_SECRET}
      - JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis
```

## Railway Deployment

1. Create new Railway service
2. Connect to GitHub repository
3. Set environment variables in Railway dashboard
4. Deploy automatically on push to main branch

## Monitoring

### Logs
- All requests logged with correlation IDs
- Error logs include stack traces
- Structured JSON logging in production

### Health Checks
- `/health`: Comprehensive health status
- `/health/ready`: Database connection check
- `/health/live`: Service alive check

### Metrics
- Request duration
- Response status codes
- Authentication failures
- Token refresh rate
- Session activity

## Error Codes

- `400` - Bad Request (validation errors)
- `401` - Unauthorized (invalid/expired token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (duplicate email)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error

## Contributing

1. Follow existing code patterns
2. Write tests for new features
3. Update documentation
4. Run linting and tests before committing
5. Use meaningful commit messages

## Development Commands

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm start            # Start production server
npm test             # Run tests
npm run lint         # Run ESLint
npm run format       # Format code with Prettier
npm run db:generate  # Generate Prisma client
npm run db:migrate   # Run database migrations
npm run db:studio    # Open Prisma Studio
```

## Support

For issues or questions, contact the Icon Radar development team.

## License

MIT License - Copyright (c) 2026 Icon Radar
