export const EVENT_PHASES = ['pre', 'ongoing', 'post'] as const;
export type EventPhase = (typeof EVENT_PHASES)[number];

/** Timezone used to decide "today" for event phases. Override with EVENT_TIMEZONE. */
export function getEventTimezone(): string {
  return process.env.EVENT_TIMEZONE || 'Asia/Kolkata';
}

/** Today's date (YYYY-MM-DD) in the given timezone. */
export function getTodayYmd(timeZone: string = getEventTimezone(), now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Postgres DATE columns come back from Prisma as UTC midnight, so the UTC date is the stored date. */
export function toYmd(value: Date | string): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

/** pre = before start date, ongoing = start..end (inclusive), post = after end date. */
export function getEventPhase(startYmd: string, endYmd: string, todayYmd: string): EventPhase {
  if (todayYmd < startYmd) return 'pre';
  if (todayYmd > endYmd) return 'post';
  return 'ongoing';
}

/** Which phases a mobile app section (e.g. Current Happening, post-event report) is shown in. */
export type PhaseFlags = {
  show_pre_event: boolean;
  show_ongoing_event: boolean;
  show_post_event: boolean;
};

export const PHASE_FLAG_OPTIONS: { flag: keyof PhaseFlags; label: string; hint: string }[] = [
  { flag: 'show_pre_event', label: 'Pre-event', hint: 'before the event start date' },
  { flag: 'show_ongoing_event', label: 'Ongoing', hint: 'between start and end date' },
  { flag: 'show_post_event', label: 'Post-event', hint: 'after the event end date' },
];

export const ALL_PHASES_ON: PhaseFlags = { show_pre_event: true, show_ongoing_event: true, show_post_event: true };

export const DEFAULT_CURRENT_HAPPENING_TITLE = 'Current Happening';
export const DEFAULT_POST_EVENT_REPORT_TITLE = 'Post-event report';

export function isVisibleInPhase(flags: PhaseFlags, phase: EventPhase): boolean {
  switch (phase) {
    case 'pre':
      return flags.show_pre_event;
    case 'ongoing':
      return flags.show_ongoing_event;
    case 'post':
      return flags.show_post_event;
  }
}
