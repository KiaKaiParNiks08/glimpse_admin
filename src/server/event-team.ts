import prisma from '@/server/prisma';

export type EventTeamRole = 'planner' | 'photographer';

export type EventTeamContact = {
  name: string;
  phone: string | null;
  email: string | null;
  image_url: string | null;
};

export type EventTeam = {
  planner: EventTeamContact | null;
  photographer: EventTeamContact | null;
};

const contactSelect = {
  name: true,
  phone: true,
  email: true,
  image_url: true,
} as const;

function toContact(row: EventTeamContact | null | undefined): EventTeamContact | null {
  if (!row) return null;
  return {
    name: row.name,
    phone: row.phone,
    email: row.email,
    image_url: row.image_url,
  };
}

export async function getEventTeam(eventId: string): Promise<EventTeam | null> {
  const event = await prisma.events.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) return null;
  const rows = await prisma.event_team.findMany({
    where: { event_id: eventId },
    select: { role: true, ...contactSelect },
  });
  const planner = rows.find((row) => row.role === 'planner');
  const photographer = rows.find((row) => row.role === 'photographer');
  return {
    planner: planner ? toContact(planner) : null,
    photographer: photographer ? toContact(photographer) : null,
  };
}

export async function setEventTeam(
  eventId: string,
  team: { planner: EventTeamContact | null; photographer: EventTeamContact | null }
): Promise<boolean> {
  const event = await prisma.events.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) return false;

  await prisma.$transaction(async (tx) => {
    for (const role of ['planner', 'photographer'] as const) {
      const contact = team[role];
      if (!contact) {
        await tx.event_team.deleteMany({ where: { event_id: eventId, role } });
        continue;
      }
      await tx.event_team.upsert({
        where: { event_id_role: { event_id: eventId, role } },
        create: {
          event_id: eventId,
          role,
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
          image_url: contact.image_url,
        },
        update: {
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
          image_url: contact.image_url,
          updated_at: new Date(),
        },
      });
    }
  });
  return true;
}
