import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { CSV, writeEventSheet } from "./scripts/eventSheetFile";

/** Keeps src/engine/career/eventSheet.ts in step with data/manual/events.csv (on start and on every save). */
function eventSheet(): Plugin {
  return {
    name: "event-sheet",
    buildStart() {
      writeEventSheet();
    },
    configureServer(server) {
      server.watcher.add(CSV);
      server.watcher.on("change", (f) => {
        if (f.endsWith(CSV) && writeEventSheet()) server.config.logger.info("events.csv changed: events reloaded");
      });
    },
  };
}

export default defineConfig({
  plugins: [eventSheet(), react(), tailwindcss()],
  worker: { format: "es" },
});
