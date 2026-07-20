import { routesZh } from "./routes";
import { shellZh } from "./shell";
import { threadZh } from "./thread";
import { inspectorZh } from "./inspector";
import { setupZh } from "./setup";
import { updateZh } from "./update";
import { settingsZh } from "./settings";

/** Merged zh dictionary. Keys are the English source strings. */
export const zh: Record<string, string> = {
  ...routesZh,
  ...shellZh,
  ...threadZh,
  ...inspectorZh,
  ...setupZh,
  ...updateZh,
  ...settingsZh,
};
