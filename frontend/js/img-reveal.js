(function () {
  function revealImg(img) {
    if (!img || img.dataset.fadeInit) return;
    img.dataset.fadeInit = '1';
    const show = () => img.classList.add('is-loaded');
    if (img.complete && img.naturalWidth > 0) {
      requestAnimationFrame(show);
    } else {
      img.addEventListener('load', () => requestAnimationFrame(show), { once: true });
      img.addEventListener('error', show, { once: true });
    }
  }

  function onSrcChange(img) {
    if (!img.src || img.src === window.location.href) return;
    img.classList.remove('is-loaded');
    delete img.dataset.fadeInit;
    revealImg(img);
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('img').forEach(revealImg);

    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var mutation = mutations[i];
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(function (node) {
            if (node.nodeType !== 1) return;
            if (node.tagName === 'IMG') {
              revealImg(node);
            } else if (node.querySelectorAll) {
              node.querySelectorAll('img').forEach(revealImg);
            }
          });
        } else if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
          onSrcChange(mutation.target);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src']
    });
  });
})();
