import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1793611779913 implements MigrationInterface {
  name = 'Init1793611779913';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TYPE "public"."media_scope_enum" AS ENUM('TEST', 'AVATAR', 'LIBRARY')
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."media_kind_enum" AS ENUM('AUDIO', 'IMAGE')
        `);
    await queryRunner.query(`
            CREATE TABLE "media" (
                "media_id" SERIAL NOT NULL,
                "scope" "public"."media_scope_enum" NOT NULL,
                "owner_id" character varying(64),
                "kind" "public"."media_kind_enum" NOT NULL,
                "storage_key" character varying(500) NOT NULL,
                "mime_type" character varying(100),
                "size_bytes" bigint,
                "duration_ms" integer,
                "transcript" text,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "created_by_id" uuid,
                "updated_at" TIMESTAMP WITH TIME ZONE,
                "updated_by_id" uuid,
                CONSTRAINT "UQ_9ba0d5268d6f75eca1b62cf10bd" UNIQUE ("storage_key"),
                CONSTRAINT "PK_f955e01e6d5c845037a3082cab8" PRIMARY KEY ("media_id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_media_scope_owner" ON "media" ("scope", "owner_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "paragraphs" (
                "paragraph_id" SERIAL NOT NULL,
                "content" text NOT NULL,
                "order" integer NOT NULL DEFAULT '0',
                "passage_id" integer NOT NULL,
                CONSTRAINT "PK_df8528f5b6bd7c9b93cd3f7f8f1" PRIMARY KEY ("paragraph_id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_paragraphs_passage_id" ON "paragraphs" ("passage_id")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."marked_by_enum" AS ENUM('ALPHABET', 'NUMBER', 'NONE')
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."status_passage_enum" AS ENUM('PUBLISHED', 'DRAFT', 'DELETED')
        `);
    await queryRunner.query(`
            CREATE TABLE "passages" (
                "passage_id" SERIAL NOT NULL,
                "title" character varying(255) NOT NULL,
                "subtitle" character varying(255),
                "marked_by" "public"."marked_by_enum" NOT NULL DEFAULT 'NONE',
                "status" "public"."status_passage_enum" NOT NULL DEFAULT 'DRAFT',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "created_by_id" uuid,
                "updated_at" TIMESTAMP WITH TIME ZONE,
                "updated_by_id" uuid,
                CONSTRAINT "PK_3ba6ddcba134928c2b180f9cf05" PRIMARY KEY ("passage_id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_passages_status" ON "passages" ("status")
        `);
    await queryRunner.query(`
            CREATE TABLE "group_passages" (
                "group_id" integer NOT NULL,
                "passage_id" integer NOT NULL,
                "order" integer NOT NULL DEFAULT '0',
                CONSTRAINT "PK_95f9d6be49fb2dfd09d7e2b2ef3" PRIMARY KEY ("group_id", "passage_id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_group_passages_passage_id" ON "group_passages" ("passage_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "questions" (
                "question_id" SERIAL NOT NULL,
                "group_id" integer NOT NULL,
                "number_from" integer NOT NULL,
                "number_to" integer NOT NULL,
                "order" integer NOT NULL,
                "prompt" text,
                "content" jsonb,
                "answer" jsonb NOT NULL,
                "explanation" text,
                "evidence" jsonb,
                "audio_media_id" integer,
                "image_media_id" integer,
                "audio_start_ms" integer,
                CONSTRAINT "chk_questions_number_range" CHECK ("number_to" >= "number_from"),
                CONSTRAINT "PK_8e940ecc478000e09fa8b008ec6" PRIMARY KEY ("question_id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_questions_group_id" ON "questions" ("group_id")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."question_type_enum" AS ENUM(
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
            CREATE TABLE "question_groups" (
                "group_id" SERIAL NOT NULL,
                "part_id" integer NOT NULL,
                "order" integer NOT NULL,
                "question_type" "public"."question_type_enum" NOT NULL,
                "instruction" text,
                "word_limit" integer,
                "content" jsonb,
                "audio_media_id" integer,
                "image_media_id" integer,
                CONSTRAINT "PK_cbd09044eba48056314fdf3a624" PRIMARY KEY ("group_id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_question_groups_part_id" ON "question_groups" ("part_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "test_parts" (
                "part_id" SERIAL NOT NULL,
                "section_id" integer NOT NULL,
                "order" integer NOT NULL,
                "title" character varying(255),
                "instruction" text,
                "audio_media_id" integer,
                "audio_start_ms" integer,
                "audio_end_ms" integer,
                "passage_id" integer,
                CONSTRAINT "PK_fd28cd7613301510ce718bdf34e" PRIMARY KEY ("part_id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_test_parts_passage_id" ON "test_parts" ("passage_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_test_parts_section_id" ON "test_parts" ("section_id")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."exam_type_enum" AS ENUM(
                'IELTS_ACADEMIC',
                'IELTS_GENERAL',
                'TOEIC_LR',
                'TOEIC_SW'
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."test_status_enum" AS ENUM('PUBLISHED', 'DRAFT', 'DELETED')
        `);
    await queryRunner.query(`
            CREATE TABLE "tests" (
                "test_id" SERIAL NOT NULL,
                "exam_type" "public"."exam_type_enum" NOT NULL,
                "title" character varying(255) NOT NULL,
                "slug" character varying(255) NOT NULL,
                "source" character varying(255),
                "duration_minutes" integer,
                "status" "public"."test_status_enum" NOT NULL DEFAULT 'DRAFT',
                "published_at" TIMESTAMP WITH TIME ZONE,
                "locked_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "created_by_id" uuid,
                "updated_at" TIMESTAMP WITH TIME ZONE,
                "updated_by_id" uuid,
                CONSTRAINT "PK_f8c701fbb2c6f4fb85cebfa0000" PRIMARY KEY ("test_id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_tests_slug" ON "tests" ("slug")
            WHERE "status" != 'DELETED'
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_tests_status" ON "tests" ("status")
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_tests_exam_type" ON "tests" ("exam_type")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."skill_enum" AS ENUM('LISTENING', 'READING', 'WRITING', 'SPEAKING')
        `);
    await queryRunner.query(`
            CREATE TABLE "test_sections" (
                "section_id" SERIAL NOT NULL,
                "test_id" integer NOT NULL,
                "skill" "public"."skill_enum" NOT NULL,
                "order" integer NOT NULL,
                "duration_minutes" integer,
                CONSTRAINT "PK_bf4d9ec0a190120408d05807403" PRIMARY KEY ("section_id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_test_sections_test_id_skill" ON "test_sections" ("test_id", "skill")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."attempt_section_status_enum" AS ENUM(
                'NOT_STARTED',
                'IN_PROGRESS',
                'SUBMITTED',
                'EXPIRED'
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "attempt_sections" (
                "attempt_section_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "attempt_id" uuid NOT NULL,
                "section_id" integer NOT NULL,
                "status" "public"."attempt_section_status_enum" NOT NULL DEFAULT 'NOT_STARTED',
                "started_at" TIMESTAMP WITH TIME ZONE,
                "deadline_at" TIMESTAMP WITH TIME ZONE,
                "submitted_at" TIMESTAMP WITH TIME ZONE,
                "raw_score" integer,
                "max_score" integer,
                "scaled_score" numeric(5, 1),
                CONSTRAINT "PK_b79002cb618a95f937f344eb087" PRIMARY KEY ("attempt_section_id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_attempt_sections_attempt_id_section_id" ON "attempt_sections" ("attempt_id", "section_id")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."status_enum" AS ENUM('ACTIVE', 'INACTIVE', 'DELETED')
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."provider_enum" AS ENUM('local', 'google')
        `);
    await queryRunner.query(`
            CREATE TABLE "permissions" (
                "permission_id" SERIAL NOT NULL,
                "action" character varying(255) NOT NULL,
                "subject" character varying(255) NOT NULL,
                "status" "public"."status_enum" NOT NULL DEFAULT 'ACTIVE',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "created_by_id" uuid,
                "updated_at" TIMESTAMP WITH TIME ZONE,
                "updated_by_id" uuid,
                CONSTRAINT "PK_1717db2235a5b169822e7f753b1" PRIMARY KEY ("permission_id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_permissions_subject" ON "permissions" ("subject")
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_permissions_action" ON "permissions" ("action")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_permissions_action_subject" ON "permissions" ("action", "subject")
            WHERE "status" != 'DELETED'
        `);
    await queryRunner.query(`
            CREATE TABLE "roles" (
                "role_id" SERIAL NOT NULL,
                "name" character varying(255) NOT NULL,
                "code" character varying(255) NOT NULL,
                "can_access_cms" boolean NOT NULL DEFAULT false,
                "system_role" boolean NOT NULL DEFAULT false,
                "status" "public"."status_enum" NOT NULL DEFAULT 'ACTIVE',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "created_by_id" uuid,
                "updated_at" TIMESTAMP WITH TIME ZONE,
                "updated_by_id" uuid,
                CONSTRAINT "PK_09f4c8130b54f35925588a37b6a" PRIMARY KEY ("role_id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_roles_code" ON "roles" ("code")
            WHERE "status" != 'DELETED'
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_roles_code" ON "roles" ("code")
        `);
    await queryRunner.query(`
            CREATE TABLE "users" (
                "user_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "email" character varying(255),
                "password" character varying(255),
                "provider" "public"."provider_enum" NOT NULL DEFAULT 'local',
                "first_name" character varying(255) NOT NULL,
                "last_name" character varying(255),
                "avatar" character varying(255),
                "avatar_media_id" integer,
                "phone" character varying(20),
                "address" character varying(500),
                "email_verified" boolean NOT NULL DEFAULT false,
                "date_of_birth" date,
                "system_user" boolean NOT NULL DEFAULT false,
                "status" "public"."status_enum" NOT NULL DEFAULT 'ACTIVE',
                "role_id" integer NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "created_by_id" uuid,
                "updated_at" TIMESTAMP WITH TIME ZONE,
                "updated_by_id" uuid,
                CONSTRAINT "PK_96aac72f1574b88752e9fb00089" PRIMARY KEY ("user_id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_users_email" ON "users" ("email")
            WHERE "status" != 'DELETED'
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_users_phone" ON "users" ("phone")
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_users_last_name" ON "users" ("last_name")
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_users_first_name" ON "users" ("first_name")
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_users_email" ON "users" ("email")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."attempt_mode_enum" AS ENUM('FULL', 'SECTION')
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."attempt_status_enum" AS ENUM('IN_PROGRESS', 'SUBMITTED', 'GRADED', 'EXPIRED')
        `);
    await queryRunner.query(`
            CREATE TABLE "attempts" (
                "attempt_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "user_id" uuid NOT NULL,
                "test_id" integer NOT NULL,
                "mode" "public"."attempt_mode_enum" NOT NULL,
                "status" "public"."attempt_status_enum" NOT NULL DEFAULT 'IN_PROGRESS',
                "started_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "deadline_at" TIMESTAMP WITH TIME ZONE,
                "submitted_at" TIMESTAMP WITH TIME ZONE,
                "overall_score" numeric(5, 1),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "created_by_id" uuid,
                "updated_at" TIMESTAMP WITH TIME ZONE,
                "updated_by_id" uuid,
                CONSTRAINT "PK_a7ad5f24328733b22dd228c79dd" PRIMARY KEY ("attempt_id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_attempts_user_id_test_id_in_progress" ON "attempts" ("user_id", "test_id")
            WHERE "status" = 'IN_PROGRESS'
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_attempts_user_id_test_id" ON "attempts" ("user_id", "test_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_attempts_user_id_started_at" ON "attempts" ("user_id", "started_at")
        `);
    await queryRunner.query(`
            CREATE TABLE "attempt_answers" (
                "attempt_id" uuid NOT NULL,
                "question_id" integer NOT NULL,
                "response" jsonb,
                "is_correct" boolean,
                "score" integer,
                "flagged" boolean NOT NULL DEFAULT false,
                "answered_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_481462ba60b9c3d57495c0ff96e" PRIMARY KEY ("attempt_id", "question_id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_attempt_answers_question_id" ON "attempt_answers" ("question_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "auth_sessions" (
                "auth_session_id" uuid NOT NULL,
                "user_id" uuid NOT NULL,
                "client" character varying(16) NOT NULL DEFAULT 'web',
                "current_jti" uuid NOT NULL,
                "token_hash" character varying(64) NOT NULL,
                "previous_jti" uuid,
                "rotated_at" TIMESTAMP WITH TIME ZONE,
                "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "revoked_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "created_by_id" uuid,
                "updated_at" TIMESTAMP WITH TIME ZONE,
                "updated_by_id" uuid,
                CONSTRAINT "PK_e4f57e0baa9b749de2f0c716ab0" PRIMARY KEY ("auth_session_id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_auth_sessions_expires_at" ON "auth_sessions" ("expires_at")
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_auth_sessions_user_id_client" ON "auth_sessions" ("user_id", "client")
        `);
    await queryRunner.query(`
            CREATE TABLE "score_scales" (
                "score_scale_id" SERIAL NOT NULL,
                "exam_type" "public"."exam_type_enum" NOT NULL,
                "skill" "public"."skill_enum" NOT NULL,
                "test_id" integer,
                "raw_score" integer NOT NULL,
                "scaled_score" numeric(5, 1) NOT NULL,
                CONSTRAINT "PK_3ed54ae2ba2a4a8e2835cb8f7e4" PRIMARY KEY ("score_scale_id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_score_scales_test" ON "score_scales" ("test_id", "skill", "raw_score")
            WHERE "test_id" IS NOT NULL
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_score_scales_default" ON "score_scales" ("exam_type", "skill", "raw_score")
            WHERE "test_id" IS NULL
        `);
    await queryRunner.query(`
            CREATE TABLE "roles_permissions" (
                "role_id" integer NOT NULL,
                "permission_id" integer NOT NULL,
                CONSTRAINT "PK_0cd11f0b35c4d348c6ebb9b36b7" PRIMARY KEY ("role_id", "permission_id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_7d2dad9f14eddeb09c256fea71" ON "roles_permissions" ("role_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_337aa8dba227a1fe6b73998307" ON "roles_permissions" ("permission_id")
        `);
    await queryRunner.query(`
            ALTER TABLE "paragraphs"
            ADD CONSTRAINT "FK_cca32c63736c62b6c911de5e1a6" FOREIGN KEY ("passage_id") REFERENCES "passages"("passage_id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "group_passages"
            ADD CONSTRAINT "FK_7f6fe320f65150f270c9c217a78" FOREIGN KEY ("group_id") REFERENCES "question_groups"("group_id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "group_passages"
            ADD CONSTRAINT "FK_64c0013723f793b572acf4a066b" FOREIGN KEY ("passage_id") REFERENCES "passages"("passage_id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "questions"
            ADD CONSTRAINT "FK_0c5f88563e9147b01521c7c8233" FOREIGN KEY ("group_id") REFERENCES "question_groups"("group_id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "questions"
            ADD CONSTRAINT "FK_c14b2652e64e21a37d003b2bf85" FOREIGN KEY ("audio_media_id") REFERENCES "media"("media_id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "questions"
            ADD CONSTRAINT "FK_5f840147a8646b0253e7f654fbe" FOREIGN KEY ("image_media_id") REFERENCES "media"("media_id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "question_groups"
            ADD CONSTRAINT "FK_5716ee6c46ecefab4aa4e18ddbf" FOREIGN KEY ("part_id") REFERENCES "test_parts"("part_id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "question_groups"
            ADD CONSTRAINT "FK_f54a46a0ac18bfd50ee4d33f422" FOREIGN KEY ("audio_media_id") REFERENCES "media"("media_id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "question_groups"
            ADD CONSTRAINT "FK_c149054abe9ab50dbddc8555f34" FOREIGN KEY ("image_media_id") REFERENCES "media"("media_id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "test_parts"
            ADD CONSTRAINT "FK_a84b674d575c021fc51b3f156c9" FOREIGN KEY ("section_id") REFERENCES "test_sections"("section_id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "test_parts"
            ADD CONSTRAINT "FK_c8d43461ca1c11c2a4387776d72" FOREIGN KEY ("audio_media_id") REFERENCES "media"("media_id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "test_parts"
            ADD CONSTRAINT "FK_685a9e56a19d52fd8764c9c9ddf" FOREIGN KEY ("passage_id") REFERENCES "passages"("passage_id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "test_sections"
            ADD CONSTRAINT "FK_54da0bd23d3c9127635878f9dee" FOREIGN KEY ("test_id") REFERENCES "tests"("test_id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "attempt_sections"
            ADD CONSTRAINT "FK_a4264d031a9ded580decbf4e496" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("attempt_id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "attempt_sections"
            ADD CONSTRAINT "FK_a658ddbc6b4dae2e2a6960431a7" FOREIGN KEY ("section_id") REFERENCES "test_sections"("section_id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "users"
            ADD CONSTRAINT "FK_a2cecd1a3531c0b041e29ba46e1" FOREIGN KEY ("role_id") REFERENCES "roles"("role_id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "users"
            ADD CONSTRAINT "FK_d9c628b3f5b6ae73eb41c2045eb" FOREIGN KEY ("avatar_media_id") REFERENCES "media"("media_id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "attempts"
            ADD CONSTRAINT "FK_1f23e642cf6e009c61cc2c214e2" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "attempts"
            ADD CONSTRAINT "FK_a5e4bc5034f5ac069defae66d13" FOREIGN KEY ("test_id") REFERENCES "tests"("test_id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "attempt_answers"
            ADD CONSTRAINT "FK_32015c863766540050618a1165c" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("attempt_id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "attempt_answers"
            ADD CONSTRAINT "FK_fff29b83c9965e08837b508f0cd" FOREIGN KEY ("question_id") REFERENCES "questions"("question_id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "auth_sessions"
            ADD CONSTRAINT "FK_50ccaa6440288a06f0ba693ccc6" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "score_scales"
            ADD CONSTRAINT "FK_f5abf326c40d04305be97433083" FOREIGN KEY ("test_id") REFERENCES "tests"("test_id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "roles_permissions"
            ADD CONSTRAINT "FK_7d2dad9f14eddeb09c256fea719" FOREIGN KEY ("role_id") REFERENCES "roles"("role_id") ON DELETE CASCADE ON UPDATE CASCADE
        `);
    await queryRunner.query(`
            ALTER TABLE "roles_permissions"
            ADD CONSTRAINT "FK_337aa8dba227a1fe6b73998307b" FOREIGN KEY ("permission_id") REFERENCES "permissions"("permission_id") ON DELETE CASCADE ON UPDATE CASCADE
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "roles_permissions" DROP CONSTRAINT "FK_337aa8dba227a1fe6b73998307b"
        `);
    await queryRunner.query(`
            ALTER TABLE "roles_permissions" DROP CONSTRAINT "FK_7d2dad9f14eddeb09c256fea719"
        `);
    await queryRunner.query(`
            ALTER TABLE "score_scales" DROP CONSTRAINT "FK_f5abf326c40d04305be97433083"
        `);
    await queryRunner.query(`
            ALTER TABLE "auth_sessions" DROP CONSTRAINT "FK_50ccaa6440288a06f0ba693ccc6"
        `);
    await queryRunner.query(`
            ALTER TABLE "attempt_answers" DROP CONSTRAINT "FK_fff29b83c9965e08837b508f0cd"
        `);
    await queryRunner.query(`
            ALTER TABLE "attempt_answers" DROP CONSTRAINT "FK_32015c863766540050618a1165c"
        `);
    await queryRunner.query(`
            ALTER TABLE "attempts" DROP CONSTRAINT "FK_a5e4bc5034f5ac069defae66d13"
        `);
    await queryRunner.query(`
            ALTER TABLE "attempts" DROP CONSTRAINT "FK_1f23e642cf6e009c61cc2c214e2"
        `);
    await queryRunner.query(`
            ALTER TABLE "users" DROP CONSTRAINT "FK_d9c628b3f5b6ae73eb41c2045eb"
        `);
    await queryRunner.query(`
            ALTER TABLE "users" DROP CONSTRAINT "FK_a2cecd1a3531c0b041e29ba46e1"
        `);
    await queryRunner.query(`
            ALTER TABLE "attempt_sections" DROP CONSTRAINT "FK_a658ddbc6b4dae2e2a6960431a7"
        `);
    await queryRunner.query(`
            ALTER TABLE "attempt_sections" DROP CONSTRAINT "FK_a4264d031a9ded580decbf4e496"
        `);
    await queryRunner.query(`
            ALTER TABLE "test_sections" DROP CONSTRAINT "FK_54da0bd23d3c9127635878f9dee"
        `);
    await queryRunner.query(`
            ALTER TABLE "test_parts" DROP CONSTRAINT "FK_685a9e56a19d52fd8764c9c9ddf"
        `);
    await queryRunner.query(`
            ALTER TABLE "test_parts" DROP CONSTRAINT "FK_c8d43461ca1c11c2a4387776d72"
        `);
    await queryRunner.query(`
            ALTER TABLE "test_parts" DROP CONSTRAINT "FK_a84b674d575c021fc51b3f156c9"
        `);
    await queryRunner.query(`
            ALTER TABLE "question_groups" DROP CONSTRAINT "FK_c149054abe9ab50dbddc8555f34"
        `);
    await queryRunner.query(`
            ALTER TABLE "question_groups" DROP CONSTRAINT "FK_f54a46a0ac18bfd50ee4d33f422"
        `);
    await queryRunner.query(`
            ALTER TABLE "question_groups" DROP CONSTRAINT "FK_5716ee6c46ecefab4aa4e18ddbf"
        `);
    await queryRunner.query(`
            ALTER TABLE "questions" DROP CONSTRAINT "FK_5f840147a8646b0253e7f654fbe"
        `);
    await queryRunner.query(`
            ALTER TABLE "questions" DROP CONSTRAINT "FK_c14b2652e64e21a37d003b2bf85"
        `);
    await queryRunner.query(`
            ALTER TABLE "questions" DROP CONSTRAINT "FK_0c5f88563e9147b01521c7c8233"
        `);
    await queryRunner.query(`
            ALTER TABLE "group_passages" DROP CONSTRAINT "FK_64c0013723f793b572acf4a066b"
        `);
    await queryRunner.query(`
            ALTER TABLE "group_passages" DROP CONSTRAINT "FK_7f6fe320f65150f270c9c217a78"
        `);
    await queryRunner.query(`
            ALTER TABLE "paragraphs" DROP CONSTRAINT "FK_cca32c63736c62b6c911de5e1a6"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_337aa8dba227a1fe6b73998307"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_7d2dad9f14eddeb09c256fea71"
        `);
    await queryRunner.query(`
            DROP TABLE "roles_permissions"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_score_scales_default"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_score_scales_test"
        `);
    await queryRunner.query(`
            DROP TABLE "score_scales"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_auth_sessions_user_id_client"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_auth_sessions_expires_at"
        `);
    await queryRunner.query(`
            DROP TABLE "auth_sessions"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_attempt_answers_question_id"
        `);
    await queryRunner.query(`
            DROP TABLE "attempt_answers"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_attempts_user_id_started_at"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_attempts_user_id_test_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_attempts_user_id_test_id_in_progress"
        `);
    await queryRunner.query(`
            DROP TABLE "attempts"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."attempt_status_enum"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."attempt_mode_enum"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_users_email"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_users_first_name"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_users_last_name"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_users_phone"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_users_email"
        `);
    await queryRunner.query(`
            DROP TABLE "users"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_roles_code"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_roles_code"
        `);
    await queryRunner.query(`
            DROP TABLE "roles"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_permissions_action_subject"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_permissions_action"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_permissions_subject"
        `);
    await queryRunner.query(`
            DROP TABLE "permissions"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."provider_enum"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."status_enum"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_attempt_sections_attempt_id_section_id"
        `);
    await queryRunner.query(`
            DROP TABLE "attempt_sections"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."attempt_section_status_enum"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_test_sections_test_id_skill"
        `);
    await queryRunner.query(`
            DROP TABLE "test_sections"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."skill_enum"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_tests_exam_type"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_tests_status"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_tests_slug"
        `);
    await queryRunner.query(`
            DROP TABLE "tests"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."test_status_enum"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."exam_type_enum"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_test_parts_section_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_test_parts_passage_id"
        `);
    await queryRunner.query(`
            DROP TABLE "test_parts"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_question_groups_part_id"
        `);
    await queryRunner.query(`
            DROP TABLE "question_groups"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."question_type_enum"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_questions_group_id"
        `);
    await queryRunner.query(`
            DROP TABLE "questions"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_group_passages_passage_id"
        `);
    await queryRunner.query(`
            DROP TABLE "group_passages"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_passages_status"
        `);
    await queryRunner.query(`
            DROP TABLE "passages"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."status_passage_enum"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."marked_by_enum"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_paragraphs_passage_id"
        `);
    await queryRunner.query(`
            DROP TABLE "paragraphs"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_media_scope_owner"
        `);
    await queryRunner.query(`
            DROP TABLE "media"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."media_kind_enum"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."media_scope_enum"
        `);
  }
}
