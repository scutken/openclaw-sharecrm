import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { shareCrmPlugin } from "./src/channel.js";
import { setShareCrmRuntime } from "./src/runtime.js";

export { monitorShareCrmProvider, stopShareCrmMonitor } from "./src/monitor.js";
export { shareCrmPlugin } from "./src/channel.js";

const plugin = {
  id: "sharecrm",
  name: "ShareCRM",
  description: "ShareCRM IM Gateway channel plugin for OpenClaw",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setShareCrmRuntime(api.runtime);
    api.registerChannel({ plugin: shareCrmPlugin });
  },
};

export default plugin;
