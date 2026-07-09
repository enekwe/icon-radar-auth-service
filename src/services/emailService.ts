import nodemailer from 'nodemailer';
import {
  VerificationEmailData,
  PasswordResetEmailData,
  EmailOptions,
} from '../types';
import { logger } from '@enekwe/icon-radar-shared';

export class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private fromEmail: string;
  private fromName: string;

  constructor() {
    this.fromEmail = process.env.EMAIL_FROM || 'noreply@iconradar.com';
    this.fromName = process.env.EMAIL_FROM_NAME || 'Icon Radar';
    this.initialize();
  }

  private initialize(): void {
    try {
      const emailEnabled = process.env.EMAIL_ENABLED === 'true';

      if (!emailEnabled) {
        logger.info('Email service disabled via EMAIL_ENABLED=false');
        return;
      }

      const emailProvider = process.env.EMAIL_PROVIDER || 'smtp';

      switch (emailProvider) {
        case 'smtp':
          this.initializeSMTP();
          break;
        case 'sendgrid':
          this.initializeSendGrid();
          break;
        case 'ses':
          this.initializeSES();
          break;
        default:
          logger.warn(`Unknown email provider: ${emailProvider}, falling back to SMTP`);
          this.initializeSMTP();
      }
    } catch (error) {
      logger.error('Failed to initialize email service', { error });
    }
  }

  private initializeSMTP(): void {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpSecure = process.env.SMTP_SECURE === 'true';

    if (!smtpHost || !smtpUser || !smtpPass) {
      logger.warn('SMTP credentials not configured, email service will be disabled');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    logger.info('Email service initialized with SMTP', { host: smtpHost, port: smtpPort });
  }

  private initializeSendGrid(): void {
    const sendgridApiKey = process.env.SENDGRID_API_KEY;

    if (!sendgridApiKey) {
      logger.warn('SendGrid API key not configured, email service will be disabled');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: {
        user: 'apikey',
        pass: sendgridApiKey,
      },
    });

    logger.info('Email service initialized with SendGrid');
  }

  private initializeSES(): void {
    const awsRegion = process.env.AWS_REGION || 'us-east-1';
    const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!awsAccessKeyId || !awsSecretAccessKey) {
      logger.warn('AWS SES credentials not configured, email service will be disabled');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: `email-smtp.${awsRegion}.amazonaws.com`,
      port: 587,
      auth: {
        user: awsAccessKeyId,
        pass: awsSecretAccessKey,
      },
    });

    logger.info('Email service initialized with AWS SES', { region: awsRegion });
  }

  private async sendEmail(options: EmailOptions): Promise<void> {
    if (!this.transporter) {
      logger.warn('Email service not configured, skipping email send', { to: options.to });

      if (process.env.NODE_ENV === 'development') {
        logger.info('Email would be sent (dev mode):', {
          to: options.to,
          subject: options.subject,
          html: options.html.substring(0, 200),
        });
      }
      return;
    }

    try {
      await this.transporter.sendMail({
        from: `"${this.fromName}" <${this.fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || this.htmlToText(options.html),
      });

      logger.info('Email sent successfully', { to: options.to, subject: options.subject });
    } catch (error) {
      logger.error('Failed to send email', { error, to: options.to, subject: options.subject });
      throw error;
    }
  }

  private htmlToText(html: string): string {
    return html
      .replace(/<style[^>]*>.*<\/style>/gm, '')
      .replace(/<[^>]+>/gm, '')
      .replace(/\s\s+/g, ' ')
      .trim();
  }

  async sendVerificationEmail(data: VerificationEmailData): Promise<void> {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 10px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #2563eb; margin-top: 0;">Welcome to Icon Radar!</h1>
    <p>Hi ${data.name},</p>
    <p>Thank you for registering with Icon Radar. To complete your registration and activate your account, please verify your email address.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${data.verificationUrl}"
         style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
        Verify Email Address
      </a>
    </div>

    <p>Or copy and paste this link into your browser:</p>
    <p style="background-color: #e5e7eb; padding: 10px; border-radius: 5px; word-break: break-all;">
      ${data.verificationUrl}
    </p>

    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
      This verification link will expire in 24 hours. If you didn't create an account with Icon Radar, you can safely ignore this email.
    </p>
  </div>

  <div style="text-align: center; color: #6b7280; font-size: 12px;">
    <p>Icon Radar - Athlete Brand Discovery Platform</p>
  </div>
</body>
</html>
    `.trim();

    await this.sendEmail({
      to: data.email,
      subject: 'Verify Your Icon Radar Account',
      html,
    });
  }

  async sendPasswordResetEmail(data: PasswordResetEmailData): Promise<void> {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 10px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #dc2626; margin-top: 0;">Password Reset Request</h1>
    <p>Hi ${data.name},</p>
    <p>We received a request to reset your password for your Icon Radar account. If you didn't make this request, you can safely ignore this email.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${data.resetUrl}"
         style="background-color: #dc2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
        Reset Password
      </a>
    </div>

    <p>Or copy and paste this link into your browser:</p>
    <p style="background-color: #e5e7eb; padding: 10px; border-radius: 5px; word-break: break-all;">
      ${data.resetUrl}
    </p>

    <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; color: #991b1b; font-weight: bold;">Security Notice</p>
      <p style="margin: 5px 0 0 0; color: #7f1d1d; font-size: 14px;">
        This password reset link will expire in 1 hour. If you didn't request this reset, please secure your account immediately.
      </p>
    </div>
  </div>

  <div style="text-align: center; color: #6b7280; font-size: 12px;">
    <p>Icon Radar - Athlete Brand Discovery Platform</p>
  </div>
</body>
</html>
    `.trim();

    await this.sendEmail({
      to: data.email,
      subject: 'Reset Your Icon Radar Password',
      html,
    });
  }

  async sendPasswordChangedNotification(email: string, name: string): Promise<void> {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Changed</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 10px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #059669; margin-top: 0;">Password Changed Successfully</h1>
    <p>Hi ${name},</p>
    <p>This is a confirmation that your Icon Radar account password was successfully changed.</p>

    <div style="background-color: #f0fdf4; border-left: 4px solid #059669; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; color: #065f46; font-size: 14px;">
        If you didn't make this change, please contact our support team immediately.
      </p>
    </div>

    <p style="color: #6b7280; font-size: 14px;">
      Changed at: ${new Date().toLocaleString()}
    </p>
  </div>

  <div style="text-align: center; color: #6b7280; font-size: 12px;">
    <p>Icon Radar - Athlete Brand Discovery Platform</p>
  </div>
</body>
</html>
    `.trim();

    await this.sendEmail({
      to: email,
      subject: 'Your Password Was Changed',
      html,
    });
  }

  async verifyConnection(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      logger.error('Email service connection verification failed', { error });
      return false;
    }
  }
}

export const emailService = new EmailService();
