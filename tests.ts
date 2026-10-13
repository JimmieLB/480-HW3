import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import extension, { REMINDERS, msUntilNext, scheduleReminders } from "./schedule.js";

const HOUR = 3_600_000;

/** Freeze the clock and timers at a local date/time (11:00 PM on Oct 12, 2026 by default). */
function useFakeClock(now = new Date(2026, 9, 12, 23, 0, 0)) {
	mock.timers.enable({ apis: ["setTimeout", "Date"], now });
}

describe("msUntilNext", () => {
	it("counts forward to later today", () => {
		const now = new Date(2026, 9, 12, 5, 0, 0); // 5:00 AM
		assert.equal(msUntilNext(now, 6, 0), HOUR);
	});

	it("rolls to tomorrow when the time has passed", () => {
		const now = new Date(2026, 9, 12, 7, 0, 0); // 7:00 AM -> 6 AM tomorrow is 23h away
		assert.equal(msUntilNext(now, 6, 0), 23 * HOUR);
	});

	it("targets the coming midnight at 12am", () => {
		const now = new Date(2026, 9, 12, 22, 30, 0);
		assert.equal(msUntilNext(now, 0, 0), 1.5 * HOUR);
	});

	it("never returns 0 when exactly on the target time", () => {
		const now = new Date(2026, 9, 12, 6, 0, 0);
		assert.equal(msUntilNext(now, 6, 0), 24 * HOUR);
	});
});

describe("scheduleReminders", () => {
	beforeEach(() => useFakeClock());
	afterEach(() => mock.timers.reset());

	it("says time to sleep at 12am", () => {
		const messages: string[] = [];
		scheduleReminders((m) => messages.push(m));
		mock.timers.tick(HOUR - 1);
		assert.equal(messages.length, 0);
		mock.timers.tick(1);
		assert.equal(messages.length, 1);
		assert.match(messages[0]!, /time to sleep/i);
	});

	it("says good morning at 6am", () => {
		const messages: string[] = [];
		scheduleReminders((m) => messages.push(m));
		mock.timers.tick(7 * HOUR - 1);
		assert.equal(messages.length, 1); // only the midnight one so far
		mock.timers.tick(1);
		assert.equal(messages.length, 2);
		assert.match(messages[1]!, /good morning/i);
	});

	it("repeats the next day", () => {
		const messages: string[] = [];
		scheduleReminders((m) => messages.push(m));
		// Step reminder by reminder: Node's mock clock doesn't fire timers re-armed within one tick.
		for (const hours of [1, 6, 18, 6]) mock.timers.tick(hours * HOUR); // 12am, 6am, 12am, 6am
		assert.deepEqual(messages, [
			REMINDERS[0]!.message,
			REMINDERS[1]!.message,
			REMINDERS[0]!.message,
			REMINDERS[1]!.message,
		]);
	});

	it("stops firing after cancel, and cancel is idempotent", () => {
		const messages: string[] = [];
		const cancel = scheduleReminders((m) => messages.push(m));
		cancel();
		cancel();
		mock.timers.tick(48 * HOUR);
		assert.equal(messages.length, 0);
	});
});

describe("extension wiring", () => {
	beforeEach(() => useFakeClock());
	afterEach(() => mock.timers.reset());

	type Handler = (event: unknown, ctx: unknown) => void;

	function load() {
		const handlers: Record<string, Handler> = {};
		extension({ on: (name: string, h: Handler) => (handlers[name] = h) } as never);
		return handlers;
	}

	function makeCtx(hasUI: boolean) {
		const notifications: Array<[string, string]> = [];
		return { hasUI, ui: { notify: (m: string, t: string) => notifications.push([m, t]) }, notifications };
	}

	it("does not start timers when the extension loads", () => {
		load();
		const ctx = makeCtx(true); // never passed to a handler, so nothing may fire
		mock.timers.tick(48 * HOUR);
		assert.equal(ctx.notifications.length, 0);
	});

	it("notifies through ctx.ui on session_start", () => {
		const h = load();
		const ctx = makeCtx(true);
		h.session_start!({}, ctx);
		mock.timers.tick(HOUR);
		assert.deepEqual(ctx.notifications, [[REMINDERS[0]!.message, "info"]]);
	});

	it("schedules nothing without a UI", () => {
		const h = load();
		const ctx = makeCtx(false);
		h.session_start!({}, ctx);
		mock.timers.tick(48 * HOUR);
		assert.equal(ctx.notifications.length, 0);
	});

	it("does not double-schedule when the session restarts", () => {
		const h = load();
		const ctx = makeCtx(true);
		h.session_start!({}, ctx);
		h.session_start!({}, ctx);
		mock.timers.tick(HOUR);
		assert.equal(ctx.notifications.length, 1);
	});

	it("clears timers on session_shutdown", () => {
		const h = load();
		const ctx = makeCtx(true);
		h.session_start!({}, ctx);
		h.session_shutdown!({}, {});
		mock.timers.tick(48 * HOUR);
		assert.equal(ctx.notifications.length, 0);
	});
});