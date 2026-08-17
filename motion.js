/* ==========================================================================
   VestaOps — capa de movimiento

   Mejora progresiva: sin este archivo la pagina se ve entera y funciona
   igual. La clase .motion se pone antes de pintar (script inline en el
   HTML) para que no haya parpadeo de contenido visible a oculto.

   Solo se anima transform, opacity, filter y clip-path.
   ========================================================================== */
(function () {
  'use strict';

  // Avisa al script inline del HTML que el motor de movimiento esta vivo.
  // Si esto no llega a ejecutarse, aquel saca la clase .motion y la pagina
  // se muestra entera sin animaciones.
  window.__vestaMotion = true;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

  /* ---------------------------------------------------------------------
     Titulares: agrupar palabras en lineas reales y enmascararlas.
     Se mide con offsetTop, que es lo unico fiable cuando el texto fluye.
     --------------------------------------------------------------------- */
  var LINE_STAGGER = 90;

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function splitIntoLines(el) {
    if (!el.dataset.sourceText) el.dataset.sourceText = el.textContent.trim();
    var words = el.dataset.sourceText.split(/\s+/);

    // Paso 1: cada palabra en su propio span, para poder medir donde cae
    el.innerHTML = words
      .map(function (w) { return '<span data-w>' + escapeHtml(w) + '</span>'; })
      .join(' ');

    // Paso 2: agrupar por posicion vertical
    var lines = [];
    var current = [];
    var lastTop = null;
    Array.prototype.forEach.call(el.querySelectorAll('[data-w]'), function (span) {
      var top = span.offsetTop;
      if (lastTop !== null && Math.abs(top - lastTop) > 2) {
        lines.push(current);
        current = [];
      }
      lastTop = top;
      current.push(span.textContent);
    });
    if (current.length) lines.push(current);

    // Paso 3: una mascara por linea.
    // Se unen con un espacio: entre bloques no se dibuja, pero sin el
    // un lector de pantalla leeria "elresultado" al juntar las lineas.
    el.innerHTML = lines
      .map(function (line, i) {
        return '<span class="line" style="--line-delay:' + i * LINE_STAGGER + 'ms">' +
               '<span>' + escapeHtml(line.join(' ')) + '</span></span>';
      })
      .join(' ');
  }

  var headlines = Array.prototype.slice.call(
    document.querySelectorAll('[data-reveal="lines"]')
  );

  function layoutHeadlines() {
    headlines.forEach(function (el) {
      var wasRevealed = el.classList.contains('is-revealed');
      el.classList.remove('is-revealed');
      splitIntoLines(el);
      if (wasRevealed) {
        // sin delay: ya estaba visible, solo se recalculo el corte de linea
        el.querySelectorAll('.line > span').forEach(function (s) {
          s.style.transition = 'none';
        });
        el.classList.add('is-revealed');
        requestAnimationFrame(function () {
          el.querySelectorAll('.line > span').forEach(function (s) {
            s.style.transition = '';
          });
        });
      }
    });
  }

  layoutHeadlines();

  var resizeTimer;
  var lastWidth = window.innerWidth;
  window.addEventListener('resize', function () {
    if (window.innerWidth === lastWidth) return; // en movil, el scroll dispara resize
    lastWidth = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layoutHeadlines, 150);
  });

  /* ---------------------------------------------------------------------
     Reveal al entrar en pantalla, una sola vez.
     Los elementos con data-delay entran en secuencia sin esperar scroll:
     son los del hero, que ya estan a la vista al cargar.
     --------------------------------------------------------------------- */
  var targets = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));

  function reveal(el) {
    var delay = parseInt(el.dataset.delay || '0', 10);
    var stagger = parseInt(el.dataset.stagger || '0', 10);
    el.style.setProperty('--reveal-delay', (delay + stagger) + 'ms');
    el.classList.add('is-revealed');

    // El barrido deja de necesitar la mascara apenas termina; mantenerla
    // recortaria la sombra de hover del boton que contiene.
    if (el.getAttribute('data-reveal') === 'wipe') {
      var done = function (e) {
        if (e && e.propertyName && e.propertyName.indexOf('mask-size') === -1) return;
        el.classList.add('motion-done');
        el.removeEventListener('transitionend', done);
      };
      el.addEventListener('transitionend', done);
      // red de seguridad por si el navegador no emite el evento
      setTimeout(done, delay + stagger + 900);
    }
  }

  // Escalonado dentro de cada grupo: las tarjetas de una seccion entran en fila
  Array.prototype.forEach.call(document.querySelectorAll('[data-stagger-group]'), function (group) {
    var step = parseInt(group.dataset.staggerGroup, 10) || 90;
    Array.prototype.forEach.call(group.children, function (child, i) {
      if (child.hasAttribute('data-reveal')) child.dataset.stagger = i * step;
    });
  });

  if (!('IntersectionObserver' in window)) {
    targets.forEach(reveal);
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      reveal(entry.target);
      observer.unobserve(entry.target); // una sola vez, no se repite al volver
    });
  }, { threshold: 0.05, rootMargin: '0px 0px -4% 0px' });

  targets.forEach(function (el) { observer.observe(el); });

  /* Red de seguridad: con un scroll muy rapido el observer puede no llegar a
     procesar un elemento y este quedaria invisible hasta volver a pasar por
     el. Este barrido revela cualquier cosa que ya haya entrado en pantalla.
     Se desengancha solo cuando no queda nada pendiente. */
  var pending = targets.slice();
  var sweeping = false;

  function sweep() {
    sweeping = false;
    pending = pending.filter(function (el) {
      if (el.classList.contains('is-revealed')) return false;
      // Basta con que haya llegado al borde inferior: eso incluye lo que esta
      // a la vista y tambien lo que ya quedo arriba tras un scroll rapido.
      if (el.getBoundingClientRect().top < window.innerHeight) {
        reveal(el);
        observer.unobserve(el);
        return false;
      }
      return true;
    });
    if (!pending.length) window.removeEventListener('scroll', onScroll);
  }

  function onScroll() {
    if (sweeping) return;
    sweeping = true;
    requestAnimationFrame(sweep);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('load', sweep);

  /* ---------------------------------------------------------------------
     Parallax del retrato y efecto magnetico del CTA.
     Solo con puntero fino y movimiento permitido.
     --------------------------------------------------------------------- */
  function pointerEffects() {
    if (reduced.matches || !finePointer.matches) return;

    var wrap = document.querySelector('.founder__portrait-wrap');
    var section = document.getElementById('victoria');
    if (wrap && section) {
      var frame = null;
      section.addEventListener('mousemove', function (e) {
        if (frame) return;
        frame = requestAnimationFrame(function () {
          frame = null;
          var r = section.getBoundingClientRect();
          var dx = (e.clientX - (r.left + r.width / 2)) / r.width;
          var dy = (e.clientY - (r.top + r.height / 2)) / r.height;
          wrap.style.setProperty('--px', (dx * 10).toFixed(2) + 'px');
          wrap.style.setProperty('--py', (dy * 10).toFixed(2) + 'px');
        });
      });
      section.addEventListener('mouseleave', function () {
        wrap.style.removeProperty('--px');
        wrap.style.removeProperty('--py');
      });
    }

    Array.prototype.forEach.call(document.querySelectorAll('[data-magnetic]'), function (btn) {
      var frame = null;
      btn.addEventListener('mousemove', function (e) {
        if (frame) return;
        frame = requestAnimationFrame(function () {
          frame = null;
          var r = btn.getBoundingClientRect();
          var dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
          var dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
          btn.style.setProperty('--mx', (dx * 4).toFixed(2) + 'px');
          btn.style.setProperty('--my', (dy * 3).toFixed(2) + 'px');
        });
      });
      function release() {
        btn.style.removeProperty('--mx');
        btn.style.removeProperty('--my');
      }
      btn.addEventListener('mouseleave', release);
      btn.addEventListener('blur', release);
    });
  }

  pointerEffects();
})();
