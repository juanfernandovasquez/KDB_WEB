// Entry point for the admin panel (ES module).
// We keep loading the legacy admin.js (which wires up all sections)
// while progressively extracting shared pieces into modules.
import "./utils.js";
import "./editors.js";
import "../admin.js";

console.info("admin main module loaded (legacy bootstrap + modules)");
