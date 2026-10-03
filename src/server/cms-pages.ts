import prisma from '@/server/prisma';
import type { ListCmsPagesQuery } from '@/lib/validations/cms-pages';

/**
 * Get list of CMS pages with optional filters and pagination.
 */
export async function getCmsPages(query: ListCmsPagesQuery) {
  const { page, limit, status } = query;
  const skip = (page - 1) * limit;

  const where = {
    ...(status && { status }),
  };

  const [rows, total] = await Promise.all([
    prisma.cms_pages.findMany({
      where,
      orderBy: { updated_at: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        slug: true,
        title: true,
        content: true,
        status: true,
        created_at: true,
        updated_at: true,
      },
    }),
    prisma.cms_pages.count({ where }),
  ]);

  return { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
}
