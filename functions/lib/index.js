"use strict";
// Cloud Functions (2nd gen) entrypoint.
// Exports are wired by name in firebase.json — adding a new export here is
// sufficient to deploy it.
Object.defineProperty(exports, "__esModule", { value: true });
exports.dailyCleanup = exports.onAuditRunCreated = void 0;
const app_1 = require("firebase-admin/app");
// Admin SDK is initialized once at cold start.
if ((0, app_1.getApps)().length === 0) {
    (0, app_1.initializeApp)();
}
var on_audit_run_created_js_1 = require("./triggers/on-audit-run-created.js");
Object.defineProperty(exports, "onAuditRunCreated", { enumerable: true, get: function () { return on_audit_run_created_js_1.onAuditRunCreated; } });
var daily_cleanup_js_1 = require("./triggers/daily-cleanup.js");
Object.defineProperty(exports, "dailyCleanup", { enumerable: true, get: function () { return daily_cleanup_js_1.dailyCleanup; } });
//# sourceMappingURL=index.js.map