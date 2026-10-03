import {
  createUserSchema,
  listUsersQuerySchema,
  parseBody,
  parseQuery,
} from '@/lib/validations';
import { ok, serverError, conflict, badRequest } from '@/lib/api-response';
import { listUsers, createUser, findUserByMobileNumber } from '@/server/users';
import { prisma } from '@/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const [query, err] = parseQuery(searchParams, listUsersQuerySchema);
    if (err) return err;

    const userRole = await prisma.roles.findFirst({
      where: { name: 'user' },
      select: { id: true },
    });

    const { page, limit } = query;
    const { users, total } = await listUsers(query, {
      excludeRoleId: userRole?.id,
    });

    return ok({
      data: users,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (e) {
    console.error(e);
    return serverError('Unable to fetch users');
  }
}

export async function POST(request: Request) {
  try {
    const [body, err] = await parseBody(request, createUserSchema);
    if (err) return err;

    const role = await prisma.roles.findUnique({
      where: { id: body.role_id },
      select: { name: true },
    });
    if (!role) {
      return badRequest('Invalid role');
    }
    if (role.name === 'user') {
      return badRequest('Cannot create user role from admin');
    }

    const mobile = body.mobile_number?.trim();
    if (mobile) {
      const existing = await findUserByMobileNumber(mobile);
      if (existing) {
        return conflict('Mobile number already in use');
      }
    }

    const user = await createUser(body);
    return ok(user, 201);
  } catch (e: unknown) {
    const prismaError = e as { code?: string };
    if (prismaError?.code === 'P2002') {
      return conflict('Email already exists');
    }
    console.error(e);
    return serverError('Unable to create user');
  }
}
