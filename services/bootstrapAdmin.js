import { getConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { countUsers, createUser } from '../repositories/userRepository.js';

/**
 * Creates the first admin from env when the `users` table is empty.
 */
export async function ensureBootstrapAdmin() {
  const n = await countUsers();
  if (n > 0) {
    return;
  }

  const cfg = getConfig();
  if (!cfg.initialAdminEmail || !cfg.initialAdminPassword) {
    logger.warn(
      'Database has no users. Set INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD in .env to create the first admin.',
    );
    return;
  }

  await createUser('Administrator', cfg.initialAdminEmail, cfg.initialAdminPassword, 'admin');
  logger.info({ email: cfg.initialAdminEmail }, 'bootstrap admin user created');
}
