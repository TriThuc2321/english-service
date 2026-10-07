import type { CustomDecorator } from '@nestjs/common';

import { SetMetadata } from '@nestjs/common';

import type { AuthClient } from '../../../types/auth.type.js';

export const CLIENTS_KEY = 'clients';

export const Clients = (...clients: AuthClient[]): CustomDecorator =>
  SetMetadata(CLIENTS_KEY, clients);
