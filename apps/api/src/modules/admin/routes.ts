import type { FastifyInstance } from 'fastify';
import type { UserRepositoryLike } from '../auth/repository';
import type { AuthUser, UserRecord } from '../auth/types';
import { toAuthUser } from '../auth/types';

export interface AdminRoutesDeps {
  userRepository: UserRepositoryLike;
}

export interface AdminUserView extends AuthUser {
  locked: boolean;
}

function toAdminUserView(user: UserRecord): AdminUserView {
  return { ...toAuthUser(user), locked: user.locked };
}

/**
 * Registers admin-only user management routes (list/lock/unlock/delete). Access is restricted to
 * users; access is granted to accounts with the persisted admin role.
 */
export async function registerAdminRoutes(app: FastifyInstance, deps: AdminRoutesDeps) {
  const { userRepository } = deps;

  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/admin/')) return;

    if (!req.userId) {
      return reply.status(401).send({ code: 'unauthenticated', message: 'Sign in required' });
    }
    if (req.userRole !== 'admin') {
      return reply.status(403).send({ code: 'forbidden', message: 'Admin access required' });
    }
  });

  app.get('/api/admin/users', async () => {
    const users = await userRepository.listUsers();
    return users.map(toAdminUserView);
  });

  app.post('/api/admin/users/:userId/lock', async (req, reply) => {
    const { userId } = req.params as { userId: string };
    if (userId === req.userId) {
      return reply.status(400).send({ code: 'cannot_lock_self', message: 'You cannot lock your own account' });
    }
    try {
      const user = await userRepository.setLocked(userId, true);
      return reply.status(200).send(toAdminUserView(user));
    } catch {
      return reply.status(404).send({ code: 'not_found', message: 'User not found' });
    }
  });

  app.post('/api/admin/users/:userId/unlock', async (req, reply) => {
    const { userId } = req.params as { userId: string };
    try {
      const user = await userRepository.setLocked(userId, false);
      return reply.status(200).send(toAdminUserView(user));
    } catch {
      return reply.status(404).send({ code: 'not_found', message: 'User not found' });
    }
  });

  app.post('/api/admin/users/:userId/promote', async (req, reply) => {
    const { userId } = req.params as { userId: string };
    try {
      const user = await userRepository.setRole(userId, 'admin');
      return reply.status(200).send(toAdminUserView(user));
    } catch {
      return reply.status(404).send({ code: 'not_found', message: 'User not found' });
    }
  });

  app.post('/api/admin/users/:userId/demote', async (req, reply) => {
    const { userId } = req.params as { userId: string };
    if (userId === req.userId) {
      return reply.status(400).send({ code: 'cannot_demote_self', message: 'You cannot demote your own account' });
    }
    try {
      const user = await userRepository.setRole(userId, 'user');
      return reply.status(200).send(toAdminUserView(user));
    } catch {
      return reply.status(404).send({ code: 'not_found', message: 'User not found' });
    }
  });

  app.delete('/api/admin/users/:userId', async (req, reply) => {
    const { userId } = req.params as { userId: string };
    if (userId === req.userId) {
      return reply.status(400).send({ code: 'cannot_delete_self', message: 'You cannot delete your own account' });
    }
    try {
      await userRepository.deleteUser(userId);
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ code: 'not_found', message: 'User not found' });
    }
  });
}
