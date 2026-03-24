import { defineSetupPluginEntry } from "openclaw/plugin-sdk/core";
import { shareCrmPlugin } from "./src/channel.js";

export default defineSetupPluginEntry(shareCrmPlugin);
