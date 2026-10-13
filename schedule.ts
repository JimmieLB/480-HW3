/**
 * Bedtime extension for Pi.
 *
 * Shows "Time to sleep" at 12:00 AM and "Good morning" at 6:00 AM (local time).
 * Load with:  pi -e ./bedtime.ts
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export interface Reminder {
	hour: number;
	minute: number;
	message: string;
}

export const REMINDERS: Reminder[] = [
	{ hour: 0, minute: 0, message: "🌙 Time to sleep" },
	{ hour: 6, minute: 0, message: "☀️ Good morning! Time to start the day." },
];

/** Milliseconds from `now` until the next local occurrence of hour:minute (always > 0). */
export function msUntilNext(now: Date, hour: number, minute: number): number {
	const next = new Date(now);
	next.setHours(hour, minute, 0, 0);
	if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
	return next.getTime() - now.getTime();
}

/**
 * Schedule every reminder. Each one re-arms itself after firing, recomputing the delay from the
 * clock so drift and DST changes don't accumulate. Returns an idempotent cancel function.
 */
export function scheduleReminders(
	notify: (message: string) => void,
	reminders: Reminder[] = REMINDERS,
	now: () => Date = () => new Date(),
): () => void {
	const timers = new Set<ReturnType<typeof setTimeout>>();
	let cancelled = false;

	const arm = (r: Reminder) => {
		if (cancelled) return;
		const timer = setTimeout(() => {
			timers.delete(timer);
			if (cancelled) return;
			notify(r.message);
			arm(r);
		}, msUntilNext(now(), r.hour, r.minute));
		timer.unref?.(); // never keep the process alive just for a reminder
		timers.add(timer);
	};

	for (const r of reminders) arm(r);

	return () => {
		cancelled = true;
		for (const t of timers) clearTimeout(t);
		timers.clear();
	};
}

export default function (pi: ExtensionAPI) {
	let cancel: (() => void) | undefined;

	const stop = () => {
		cancel?.();
		cancel = undefined;
	};

	// Timers start on session_start (not in the factory) and stop on session_shutdown.
	pi.on("session_start", (_event, ctx: ExtensionContext) => {
		stop(); // reload / session replacement: never double-schedule
		if (!ctx.hasUI) return; // print/JSON mode has nobody to notify
		cancel = scheduleReminders((message) => ctx.ui.notify(message, "info"));
	});

	pi.on("session_shutdown", () => stop());
}