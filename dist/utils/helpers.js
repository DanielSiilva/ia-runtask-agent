"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logTimestamp = exports.debugMessage = void 0;
exports.sanitizeHeaderValue = sanitizeHeaderValue;
const debugMessage = (msg, data = {}) => {
    console.log(msg, data);
    const timestamp = new Date().toISOString().replace(/[^\x20-\x7E]/g, "");
    const safeData = JSON.parse(JSON.stringify(data));
    return JSON.stringify({ msg, data: safeData, timestamp });
};
exports.debugMessage = debugMessage;
function sanitizeHeaderValue(value) {
    return value.replace(/[^\x00-\x7F]/g, "");
}
const logTimestamp = (label, start) => {
    const timestamp = new Date().toISOString();
    const time = ((performance.now() - start) / 1000).toFixed(2);
    console.log(`⏱️ [${timestamp}] ${label}: ${time}s`);
};
exports.logTimestamp = logTimestamp;
