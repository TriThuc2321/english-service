import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailCodes1794204317983 implements MigrationInterface {
  name = 'AddEmailCodes1794204317983';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TYPE "public"."email_code_purpose_enum" AS ENUM('VERIFY_EMAIL', 'RESET_PASSWORD')
        `);
    await queryRunner.query(`
            CREATE TABLE "email_codes" (
                "email_code_id" SERIAL NOT NULL,
                "user_id" uuid NOT NULL,
                "purpose" "public"."email_code_purpose_enum" NOT NULL,
                "code_hash" character varying(64) NOT NULL,
                "sent_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "attempts" integer NOT NULL DEFAULT '0',
                "consumed_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "created_by_id" uuid,
                "updated_at" TIMESTAMP WITH TIME ZONE,
                "updated_by_id" uuid,
                CONSTRAINT "PK_2a2d135a2a6d89ce0c2d63b5ef0" PRIMARY KEY ("email_code_id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_email_codes_user_purpose" ON "email_codes" ("user_id", "purpose")
        `);
    await queryRunner.query(`
            ALTER TABLE "email_codes"
            ADD CONSTRAINT "FK_60a2fdb525cba0453b3f5a342d4" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "email_codes" DROP CONSTRAINT "FK_60a2fdb525cba0453b3f5a342d4"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_email_codes_user_purpose"
        `);
    await queryRunner.query(`
            DROP TABLE "email_codes"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."email_code_purpose_enum"
        `);
  }
}
