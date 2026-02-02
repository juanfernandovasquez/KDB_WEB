// Entry point for the admin panel (ES module).
// We keep loading the legacy admin.js (which wires up all sections)
// while progressively extracting shared pieces into modules.
import "./utils.js?v=20260202";
import "./editors.js?v=20260202";
import "./admin.js?v=20260202";

console.info("admin main module loaded (legacy bootstrap + modules)");
