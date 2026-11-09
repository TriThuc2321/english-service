import { Inject, Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

import { type MailConfig, mailConfig } from '../../configs/mail.config.js';

export interface IMail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly client: Resend;

  constructor(@Inject(mailConfig.KEY) private readonly config: MailConfig) {
    this.client = new Resend(config.resendApiKey);
  }

  // Never throws: auth endpoints answer the same whether or not a mail went out.
  async send(mail: IMail): Promise<void> {
    try {
      const { error } = await this.client.emails.send({
        from: this.config.from,
        ...mail,
      });
      if (error) {
        this.logger.error(`Failed to send "${mail.subject}": ${error.message}`);
      }
    } catch (error) {
      this.logger.error(`Failed to send "${mail.subject}"`, error);
    }
  }
}
