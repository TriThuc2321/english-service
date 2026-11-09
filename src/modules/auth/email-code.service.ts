import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt, timingSafeEqual } from 'node:crypto';
import { Repository } from 'typeorm';

import { EmailCode } from '../../entities/email-code.entity.js';
import { EmailCodePurpose } from '../../types/auth.type.js';

export const CODE_TTL_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 60_000;

const DUMMY_CODE_HASH = EmailCode.hash('dummy');

@Injectable()
export class EmailCodeService {
  constructor(
    @InjectRepository(EmailCode)
    private readonly emailCodeRepository: Repository<EmailCode>,
  ) {}

  /** Returns the plain code to send, or `null` while the resend cooldown runs. */
  async issue(userId: string, purpose: EmailCodePurpose) {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const rows: unknown[] = await this.emailCodeRepository.query(
      `INSERT INTO email_codes (user_id, purpose, code_hash, sent_at, expires_at, attempts, consumed_at)
       VALUES ($1, $2, $3, NOW(), NOW() + $4 * INTERVAL '1 millisecond', 0, NULL)
       ON CONFLICT (user_id, purpose) DO UPDATE SET
         code_hash = EXCLUDED.code_hash,
         sent_at = EXCLUDED.sent_at,
         expires_at = EXCLUDED.expires_at,
         attempts = 0,
         consumed_at = NULL,
         updated_at = NOW()
       WHERE email_codes.consumed_at IS NOT NULL
          OR email_codes.sent_at < NOW() - $5 * INTERVAL '1 millisecond'
       RETURNING email_code_id`,
      [userId, purpose, EmailCode.hash(code), CODE_TTL_MS, RESEND_COOLDOWN_MS],
    );
    return rows.length ? code : null;
  }

  /**
   * Each call claims one attempt atomically before comparing, so concurrent
   * guesses can't exceed MAX_ATTEMPTS, and the final consume is conditional so
   * a code is accepted at most once.
   */
  async consume(
    userId: string | undefined,
    purpose: EmailCodePurpose,
    code: string,
  ) {
    const given = Buffer.from(EmailCode.hash(code));
    if (!userId) {
      timingSafeEqual(given, Buffer.from(DUMMY_CODE_HASH));
      return false;
    }

    const claim = await this.emailCodeRepository
      .createQueryBuilder()
      .update()
      .set({ attempts: () => 'attempts + 1' })
      .where('user_id = :userId AND purpose = :purpose', { userId, purpose })
      .andWhere('consumed_at IS NULL')
      .andWhere('expires_at > NOW()')
      .andWhere('attempts < :max', { max: MAX_ATTEMPTS })
      .returning('email_code_id, code_hash')
      .execute();
    const row = (
      claim.raw as Array<{ email_code_id: number; code_hash: string }>
    )[0];

    const stored = Buffer.from(row?.code_hash ?? DUMMY_CODE_HASH);
    if (!timingSafeEqual(given, stored) || !row) {
      return false;
    }

    const consumed = await this.emailCodeRepository
      .createQueryBuilder()
      .update()
      .set({ consumedAt: () => 'NOW()' })
      .where('email_code_id = :id AND consumed_at IS NULL', {
        id: row.email_code_id,
      })
      .execute();
    return consumed.affected === 1;
  }
}
