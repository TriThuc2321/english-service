import { Injectable } from '@nestjs/common';

import { MediaKind, MediaScope } from '../../types/media.type.js';
import { MediaService } from '../media/media.service.js';
import {
  ConfirmAttemptAudioDto,
  CreateAttemptAudioUploadDto,
} from './dto/student-attempts.dto.js';
import { StudentAttemptsService } from './student-attempts.service.js';

@Injectable()
export class AttemptAudioService {
  constructor(
    private readonly attempts: StudentAttemptsService,
    private readonly media: MediaService,
  ) {}

  async createUploadUrl(
    userId: string,
    id: string,
    { questionId, contentType }: CreateAttemptAudioUploadDto,
  ) {
    await this.attempts.assertAudioQuestionOpen(userId, id, questionId);
    return this.media.createUploadUrl({
      scope: MediaScope.ATTEMPT,
      ownerId: id,
      kind: MediaKind.AUDIO,
      contentType,
    });
  }

  async confirm(
    userId: string,
    id: string,
    { questionId, storageKey }: ConfirmAttemptAudioDto,
  ) {
    await this.attempts.assertAudioQuestionOpen(userId, id, questionId);
    // Outside the attempt transaction: it calls R2 and takes its own pool connection
    const media = await this.media.create(
      {
        scope: MediaScope.ATTEMPT,
        ownerId: id,
        kind: MediaKind.AUDIO,
        storageKey,
      },
      userId,
    );
    const saved = await this.attempts
      .saveAudio(userId, id, questionId, media.id)
      .catch(async (error: unknown) => {
        await this.media.deleteQuietly(media.id);
        throw error;
      });
    if (saved.previousMediaId) {
      await this.media.deleteQuietly(saved.previousMediaId);
    }
    return saved.answer;
  }
}
