import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTeacherGrading1793864942789 implements MigrationInterface {
  name = 'AddTeacherGrading1793864942789';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "assessments" (
                "assessment_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "attempt_section_id" uuid NOT NULL,
                "revision" integer NOT NULL,
                "grader_id" uuid NOT NULL,
                "band" numeric(3, 1) NOT NULL,
                "details" jsonb NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_698848c75a15cb64e5b2ffbe8b2" PRIMARY KEY ("assessment_id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_assessments_attempt_section_id_revision" ON "assessments" ("attempt_section_id", "revision")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."attempt_section_grading_status_enum" AS ENUM('AUTO_GRADED', 'PENDING', 'GRADED')
        `);
    await queryRunner.query(`
            ALTER TABLE "attempt_sections"
            ADD "grading_status" "public"."attempt_section_grading_status_enum"
        `);
    await queryRunner.query(`
            UPDATE "attempt_sections" s SET "grading_status" = 'AUTO_GRADED'
            FROM "attempts" a
            WHERE a."attempt_id" = s."attempt_id" AND a."status" <> 'IN_PROGRESS'
        `);
    await queryRunner.query(`
            ALTER TYPE "public"."question_type_enum"
            ADD VALUE 'IELTS_WRITING_TASK_1'
        `);
    await queryRunner.query(`
            ALTER TYPE "public"."question_type_enum"
            ADD VALUE 'IELTS_WRITING_TASK_2'
        `);
    await queryRunner.query(`
            ALTER TYPE "public"."question_type_enum"
            ADD VALUE 'IELTS_SPEAKING_PART_1'
        `);
    await queryRunner.query(`
            ALTER TYPE "public"."question_type_enum"
            ADD VALUE 'IELTS_SPEAKING_PART_2'
        `);
    await queryRunner.query(`
            ALTER TYPE "public"."question_type_enum"
            ADD VALUE 'IELTS_SPEAKING_PART_3'
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_attempt_sections_pending" ON "attempt_sections" ("submitted_at")
            WHERE "grading_status" = 'PENDING'
        `);
    await queryRunner.query(`
            ALTER TABLE "assessments"
            ADD CONSTRAINT "FK_666210023d9486ab6a004c6c015" FOREIGN KEY ("attempt_section_id") REFERENCES "attempt_sections"("attempt_section_id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "assessments"
            ADD CONSTRAINT "FK_f2a94bf81a3fb5332674909f91a" FOREIGN KEY ("grader_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "assessments" DROP CONSTRAINT "FK_f2a94bf81a3fb5332674909f91a"
        `);
    await queryRunner.query(`
            ALTER TABLE "assessments" DROP CONSTRAINT "FK_666210023d9486ab6a004c6c015"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_attempt_sections_pending"
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."question_type_enum_old" AS ENUM(
                'MULTIPLE_CHOICE',
                'MULTIPLE_CHOICE_MULTI',
                'TRUE_FALSE_NOT_GIVEN',
                'YES_NO_NOT_GIVEN',
                'MATCHING_HEADINGS',
                'MATCHING_INFORMATION',
                'MATCHING_FEATURES',
                'MATCHING_SENTENCE_ENDINGS',
                'CLASSIFICATION',
                'FORM_COMPLETION',
                'SENTENCE_COMPLETION',
                'SUMMARY_COMPLETION',
                'NOTE_COMPLETION',
                'TABLE_COMPLETION',
                'FLOW_CHART_COMPLETION',
                'DIAGRAM_LABELLING',
                'MAP_LABELLING',
                'PLAN_LABELLING',
                'SHORT_ANSWER',
                'PHOTO_DESCRIPTION',
                'QUESTION_RESPONSE',
                'TEXT_COMPLETION',
                'READ_ALOUD',
                'DESCRIBE_PICTURE',
                'RESPOND_TO_QUESTIONS',
                'RESPOND_USING_INFO',
                'EXPRESS_OPINION',
                'WRITE_SENTENCE_PICTURE',
                'RESPOND_WRITTEN_REQUEST',
                'OPINION_ESSAY'
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "question_groups"
            ALTER COLUMN "question_type" TYPE "public"."question_type_enum_old" USING "question_type"::"text"::"public"."question_type_enum_old"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."question_type_enum"
        `);
    await queryRunner.query(`
            ALTER TYPE "public"."question_type_enum_old"
            RENAME TO "question_type_enum"
        `);
    await queryRunner.query(`
            ALTER TABLE "attempt_sections" DROP COLUMN "grading_status"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."attempt_section_grading_status_enum"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_assessments_attempt_section_id_revision"
        `);
    await queryRunner.query(`
            DROP TABLE "assessments"
        `);
  }
}
