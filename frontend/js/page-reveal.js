(function () {
  function reveal() {
    requestAnimationFrame(function () {
      document.body.classList.add('page-ready');
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', reveal);
  } else {
    reveal();
  }
})();
