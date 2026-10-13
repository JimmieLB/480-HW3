// sleep-scheduler.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import sleepScheduler from "./sleep-schedule.js";

function setup(hasUI = true) {
    let handler: ((event: unknown, ctx: any) => Promise<void>) | undefined;

    const pi = {
        on: vi.fn((event: string, cb: any) => {
            if (event === "session_start") handler = cb;
        }),
    };
    const notify = vi.fn();
    const ctx = { hasUI, ui: { notify } };

    sleepScheduler(pi as any);

    return {
        pi,
        notify,
        start: () => handler!({}, ctx),
    };
}

// Local time, since the extension uses getHours()/getMinutes()
const at = (h: number, m = 0, s = 0) => new Date(2026, 9, 12, h, m, s);

const tick = (ms = 30_000) => vi.advanceTimersByTime(ms);

describe("sleep scheduler extension", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.clearAllTimers(); // the extension never clears its interval
        vi.useRealTimers();
    });

    it("registers a session_start handler", () => {
        const { pi } = setup();
        expect(pi.on).toHaveBeenCalledWith("session_start", expect.any(Function));
    });

    it("shows a loaded toast on session start", async () => {
        vi.setSystemTime(at(12));
        const { start, notify } = setup();
        await start();
        expect(notify).toHaveBeenCalledWith(expect.stringContaining("loaded"), "info");
    });

    it("does not notify when there is no UI", async () => {
        vi.setSystemTime(at(23, 45));
        const { start, notify } = setup(false);
        await start();
        tick();
        expect(notify).not.toHaveBeenCalled();
    });

    it("says goodnight inside the midnight window, only once", async () => {
        vi.setSystemTime(at(23, 29, 50));
        const { start, notify } = setup();
        await start();
        notify.mockClear();

        tick(); // 23:30:20
        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify).toHaveBeenCalledWith(expect.stringContaining("Goodnight"), "info");

        tick(5 * 60_000); // still in window
        expect(notify).toHaveBeenCalledTimes(1);
    });

    it("also triggers after midnight (00:00-00:30)", async () => {
        vi.setSystemTime(at(0, 10));
        const { start, notify } = setup();
        await start();
        notify.mockClear();

        tick();
        expect(notify).toHaveBeenCalledWith(expect.stringContaining("Goodnight"), "info");
    });

    it("says good morning between 6:00 and 6:15, only once", async () => {
        vi.setSystemTime(at(5, 59, 50));
        const { start, notify } = setup();
        await start();
        notify.mockClear();

        tick(); // 6:00:20
        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify).toHaveBeenCalledWith(expect.stringContaining("Good morning"), "info");

        tick(5 * 60_000);
        expect(notify).toHaveBeenCalledTimes(1);
    });

    it("stays quiet outside the windows", async () => {
        vi.setSystemTime(at(14));
        const { start, notify } = setup();
        await start();
        notify.mockClear();

        tick(60 * 60_000); // an hour of midday
        expect(notify).not.toHaveBeenCalled();
    });

    it("stays quiet at 6:16 and after", async () => {
        vi.setSystemTime(at(6, 16));
        const { start, notify } = setup();
        await start();
        notify.mockClear();

        tick(10 * 60_000);
        expect(notify).not.toHaveBeenCalled();
    });

    it("re-arms greetings the next day", async () => {
        vi.setSystemTime(at(23, 35));
        const { start, notify } = setup();
        await start();
        notify.mockClear();

        tick(); // goodnight
        expect(notify).toHaveBeenCalledTimes(1);

        // jump to midday so flags clear (hour 12 is not in activeHours)
        vi.setSystemTime(at(12));
        tick();

        // next night
        vi.setSystemTime(at(23, 40));
        tick();
        expect(notify).toHaveBeenCalledTimes(2);
    });
});