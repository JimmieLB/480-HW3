import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
export default function (pi: ExtensionAPI) {
    // Tracks if greetings were already sent for the active day windows
    let midnightGreeted = false;
    let morningGreeted = false;

    // The active hours to prevent unnecessary flag resets
    const activeHours = [23, 0, 6];

    // Hook into the session start event to kick off our interval
    pi.on("session_start", async (_event, ctx) => {
        // Send a quick toast to the terminal UI that the extension is active
        if (ctx.hasUI) {
            ctx.ui.notify("Sleep Scheduler extension loaded! 🛌", "info");
        }

        setInterval(() => {
            const now = new Date();
            const currentHour = now.getHours();
            const currentMinute = now.getMinutes();

            // 1. Near Midnight Window: 11:30 PM (23:30) to 12:30 AM (00:30)
            const isNearMidnight = 
                (currentHour === 23 && currentMinute >= 30) || 
                (currentHour === 0 && currentMinute <= 30);

            if (isNearMidnight) {
                if (!midnightGreeted) {
                    if (ctx.hasUI) {
                        ctx.ui.notify("Goodnight, go to sleep! 🌙", "info");
                    }
                    midnightGreeted = true;
                    morningGreeted = false; // Arm morning greeting
                }
            }
            // 2. Morning Window: 6:00 AM to 6:15 AM
            else if (currentHour === 6 && currentMinute >= 0 && currentMinute <= 15) {
                if (!morningGreeted) {
                    if (ctx.hasUI) {
                        ctx.ui.notify("Good morning! ☀️", "info");
                    }
                    morningGreeted = true;
                    midnightGreeted = false; // Arm midnight greeting
                }
            }
            // 3. Clear flags safely when completely outside active windows
            else if (!activeHours.includes(currentHour)) {
                midnightGreeted = false;
                morningGreeted = false;
            }
            
        }, 30000); // Polls every 30 seconds cross-platform
    });
}