const menuBtn = document.getElementById("menu-btn");
const sidePanel = document.getElementById("side-panel");
const closeBtn = document.getElementById("close-btn");

if (menuBtn && sidePanel && closeBtn) {
  menuBtn.addEventListener("click", () => {
    sidePanel.classList.add("show");
    closeBtn.classList.add("show");
  });

  closeBtn.addEventListener("click", () => {
    sidePanel.classList.remove("show");
    closeBtn.classList.remove("show");
  });

  // Aseguramos que al cargar esté cerrado
  document.addEventListener("DOMContentLoaded", () => {
    sidePanel.classList.remove("show");
    closeBtn.classList.remove("show");
  });
}
