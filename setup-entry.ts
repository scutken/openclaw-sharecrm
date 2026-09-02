import { defineSetupPluginEntry } from "openclaw/plugin-sdk/channel-core";
import { shareCrmPlugin } from "./src/channel.js";

export default defineSetupPluginEntry(shareCrmPlugin);
