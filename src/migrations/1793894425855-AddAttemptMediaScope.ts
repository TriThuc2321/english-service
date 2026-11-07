import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAttemptMediaScope1793894425855 implements MigrationInterface {
  name = 'AddAttemptMediaScope1793894425855';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."idx_media_scope_owner"
        `);
    await queryRunner.query(`
            ALTER TYPE "public"."media_scope_enum"
            ADD VALUE 'ATTEMPT'
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_media_scope_owner" ON "media" ("scope", "owner_id")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."idx_media_scope_owner"
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."media_scope_enum_old" AS ENUM('TEST', 'AVATAR', 'LIBRARY')
        `);
    await queryRunner.query(`
            ALTER TABLE "media"
            ALTER COLUMN "scope" TYPE "public"."media_scope_enum_old" USING "scope"::"text"::"public"."media_scope_enum_old"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."media_scope_enum"
        `);
    await queryRunner.query(`
            ALTER TYPE "public"."media_scope_enum_old"
            RENAME TO "media_scope_enum"
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_media_scope_owner" ON "media" USING btree ("scope", "owner_id")
        `);
  }
}
