import { ConfigType, registerAs } from '@nestjs/config';

export const mailConfig = registerAs('mail', () => ({
  resendApiKey: process.env.RESEND_API_KEY as string,
  from: process.env.MAIL_FROM as string,
}));

export type MailConfig = ConfigType<typeof mailConfig>;
