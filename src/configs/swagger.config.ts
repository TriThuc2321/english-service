import type { INestApplication } from '@nestjs/common';

import { DocumentBuilder, getSchemaPath, SwaggerModule } from '@nestjs/swagger';

import { ErrorResponseDto } from '../shared/dto/index.js';

export const SWAGGER_PATH = 'docs';

const errorResponse = { $ref: getSchemaPath(ErrorResponseDto) };

export const createOpenApiDocument = (app: INestApplication) => {
  const config = new DocumentBuilder()
    .setTitle('My English APIs')
    .setDescription('My English APIs document')
    .setVersion('1.0.0')
    .addBearerAuth()
    .addGlobalResponse(
      { status: 400, description: 'Bad Request', schema: errorResponse },
      { status: 429, description: 'Too Many Requests', schema: errorResponse },
    )
    .build();

  return SwaggerModule.createDocument(app, config, {
    extraModels: [ErrorResponseDto],
    // Default ids are `UsersController_findAll`; FE codegen turns these into
    // hook/function names, so drop the noise.
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  });
};

export const configSwagger = (app: INestApplication) => {
  SwaggerModule.setup(SWAGGER_PATH, app, createOpenApiDocument(app), {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
};
