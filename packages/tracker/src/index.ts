import { createTracker } from "./tracker";

// document.currentScript is the <script> tag that loaded this file
createTracker(window, document.currentScript as HTMLScriptElement | null);
