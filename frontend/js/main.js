// Renderizado
document.getElementById("header").innerHTML = renderHeader();
document.getElementById("hero").innerHTML = renderHero();
document.getElementById("about").innerHTML = renderAbout();
document.getElementById("footer").innerHTML = renderFooter();

// Inicializar Swiper
const swiper = new Swiper(".hero-swiper", {
  effect: "fade",
  loop: true,
  autoplay: { delay: 5000, disableOnInteraction: false },
  pagination: { el: ".swiper-pagination", clickable: true },
  speed: 1200,
});
