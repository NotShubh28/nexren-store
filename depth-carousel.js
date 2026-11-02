// DepthCarousel Vanilla JS Component - React Bits
(function (global) {
  'use strict';

  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
  const normalizeItem = it => (typeof it === 'string' ? { image: it, alt: '' } : it);

  function createDepthCarousel(container, options = {}) {
    if (!container) return null;
    const gsap = global.gsap;
    if (!gsap) {
      console.warn('GSAP not found. Please ensure gsap.min.js is loaded.');
      return null;
    }

    let rawItems = options.items || [];
    let data = (Array.isArray(rawItems) ? rawItems : []).map(normalizeItem);
    let count = data.length;

    const cfg = {
      cardWidth: options.cardWidth ?? 175,
      cardHeight: options.cardHeight ?? 340,
      radius: options.radius ?? 16,
      tint: options.tint || '#05060a',
      depth: options.depth ?? 150,
      spread: options.spread ?? 65,
      tilt: options.tilt ?? 20,
      tiltDirection: options.tiltDirection || 'right',
      perspective: options.perspective ?? 1100,
      visibleCards: options.visibleCards ?? 3,
      falloff: options.falloff ?? 0.22,
      blur: options.blur ?? 5,
      duration: options.duration ?? 650,
      ease: options.ease || 'power3.out',
      autoplay: options.autoplay ?? false,
      autoplayDelay: options.autoplayDelay ?? 3200,
      loop: options.loop ?? true,
      showControls: options.showControls ?? true,
      showIndicators: options.showIndicators ?? true,
      onChange: options.onChange
    };

    let pos = 0;
    let focus = 0;
    let active = 0;
    let tween = null;
    let scale = 1;
    let drag = null;
    let wheelTimer = null;
    let autoTimer = null;
    let reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // DOM Elements
    const rootEl = document.createElement('div');
    rootEl.className = `depth-carousel ${options.className || ''}`.trim();
    rootEl.style.setProperty('--dc-perspective', `${cfg.perspective}px`);
    rootEl.setAttribute('role', 'group');
    rootEl.setAttribute('aria-roledescription', 'carousel');
    rootEl.setAttribute('aria-label', 'Depth carousel');
    rootEl.tabIndex = 0;

    const stageEl = document.createElement('div');
    stageEl.className = 'depth-carousel__stage';
    rootEl.appendChild(stageEl);

    let cardEls = [];
    let overlayEls = [];
    let dotsContainer = null;
    let dotButtons = [];
    let prevBtn = null;
    let nextBtn = null;

    function renderDOM() {
      stageEl.innerHTML = '';
      cardEls = [];
      overlayEls = [];

      data.forEach((item, i) => {
        const card = document.createElement('div');
        card.className = 'depth-carousel__card';
        card.style.width = `${cfg.cardWidth}px`;
        card.style.height = `${cfg.cardHeight}px`;
        card.style.borderRadius = `${cfg.radius}px`;
        card.setAttribute('aria-roledescription', 'slide');
        card.setAttribute('aria-label', `${i + 1} of ${count}`);
        card.setAttribute('aria-hidden', active !== i ? 'true' : 'false');

        const img = document.createElement('img');
        img.className = 'depth-carousel__img';
        img.src = item.image;
        img.alt = item.alt || `Slide ${i + 1}`;
        img.draggable = false;
        card.appendChild(img);

        const tintSpan = document.createElement('span');
        tintSpan.className = 'depth-carousel__tint';
        tintSpan.style.background = cfg.tint;
        card.appendChild(tintSpan);

        card.addEventListener('click', () => {
          if (drag?.moved) return;
          setFocus(i, true);
        });

        stageEl.appendChild(card);
        cardEls.push(card);
        overlayEls.push(tintSpan);
      });

      // Controls
      if (prevBtn) prevBtn.remove();
      if (nextBtn) nextBtn.remove();
      if (cfg.showControls && count > 1) {
        prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'depth-carousel__arrow depth-carousel__arrow--prev';
        prevBtn.setAttribute('aria-label', 'Previous slide');
        prevBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        `;
        prevBtn.addEventListener('click', e => {
          e.stopPropagation();
          navigateBy(-1);
        });
        rootEl.appendChild(prevBtn);

        nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'depth-carousel__arrow depth-carousel__arrow--next';
        nextBtn.setAttribute('aria-label', 'Next slide');
        nextBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        `;
        nextBtn.addEventListener('click', e => {
          e.stopPropagation();
          navigateBy(1);
        });
        rootEl.appendChild(nextBtn);
      }

      // Dots
      if (dotsContainer) dotsContainer.remove();
      dotButtons = [];
      if (cfg.showIndicators && count > 1) {
        dotsContainer = document.createElement('div');
        dotsContainer.className = 'depth-carousel__dots';
        dotsContainer.setAttribute('role', 'tablist');
        dotsContainer.setAttribute('aria-label', 'Slides');

        data.forEach((_, i) => {
          const dot = document.createElement('button');
          dot.type = 'button';
          dot.role = 'tab';
          dot.className = `depth-carousel__dot${active === i ? ' is-active' : ''}`;
          dot.setAttribute('aria-selected', active === i ? 'true' : 'false');
          dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
          dot.addEventListener('click', e => {
            e.stopPropagation();
            setFocus(i, true);
          });
          dotsContainer.appendChild(dot);
          dotButtons.push(dot);
        });

        rootEl.appendChild(dotsContainer);
      }

      layout(pos);
    }

    function layout(currPos) {
      const n = count;
      if (!n) return;
      const dir = cfg.tiltDirection === 'left' ? -1 : 1;
      const sc = scale;

      for (let i = 0; i < n; i++) {
        const el = cardEls[i];
        if (!el) continue;

        let d = i - currPos;
        if (cfg.loop && n > 1) {
          d = ((d % n) + n) % n;
          if (d > n / 2) d -= n;
        }

        const back = Math.max(0, d);
        const az = Math.abs(d);
        const shown = az <= cfg.visibleCards + 0.5;

        const tz = -cfg.depth * d;
        const tx = dir * cfg.spread * d;
        const ry = dir * cfg.tilt * clamp(d, 0, 1);

        let opacity = d < 0 ? Math.max(0, 1 + d) : 1;
        if (!shown) opacity = 0;

        const brightness = Math.max(0.18, 1 - back * cfg.falloff);
        const blurPx = cfg.blur > 0 ? Math.min(cfg.blur, (back / Math.max(1, cfg.visibleCards)) * cfg.blur) : 0;
        const zi = Math.round(2000 - d * 20);

        el.style.transform = `translate(-50%, -50%) scale(${sc}) translateX(${tx.toFixed(2)}px) translateZ(${tz.toFixed(2)}px) rotateY(${ry.toFixed(3)}deg)`;
        el.style.opacity = opacity.toFixed(3);
        el.style.filter = `brightness(${brightness.toFixed(3)}) blur(${blurPx.toFixed(2)}px)`;
        el.style.zIndex = String(zi);
        el.style.pointerEvents = shown && opacity > 0.05 ? 'auto' : 'none';

        const ov = overlayEls[i];
        if (ov) ov.style.opacity = clamp(back * cfg.falloff * 1.25, 0, 0.86).toFixed(3);
      }
    }

    function notify(idx) {
      active = idx;
      cardEls.forEach((c, i) => c.setAttribute('aria-hidden', i !== idx ? 'true' : 'false'));
      dotButtons.forEach((b, i) => {
        if (i === idx) {
          b.classList.add('is-active');
          b.setAttribute('aria-selected', 'true');
        } else {
          b.classList.remove('is-active');
          b.setAttribute('aria-selected', 'false');
        }
      });
      cfg.onChange?.(idx, data[idx]);
    }

    function tweenTo(target, animate) {
      tween?.kill();
      const proxy = { p: pos };
      const dur = animate && !reduced ? cfg.duration / 1000 : 0;
      tween = gsap.to(proxy, {
        p: target,
        duration: dur,
        ease: cfg.ease,
        onUpdate: () => {
          pos = proxy.p;
          layout(pos);
        },
        onComplete: () => {
          const n = count;
          if (n > 0) pos = ((pos % n) + n) % n;
          layout(pos);
        }
      });
    }

    function setFocus(rawIndex, animate = true) {
      const n = count;
      if (!n) return;
      const idx = cfg.loop ? ((rawIndex % n) + n) % n : clamp(rawIndex, 0, n - 1);
      let delta = idx - pos;
      if (cfg.loop && n > 1) {
        delta = ((delta % n) + n) % n;
        if (delta > n / 2) delta -= n;
      }
      tweenTo(pos + delta, animate);
      if (idx !== focus) {
        focus = idx;
        notify(idx);
      }
    }

    function navigateBy(step) {
      setFocus(focus + step, true);
    }

    // Pointer Drag Listeners
    function onPointerDown(e) {
      if (count < 2) return;
      tween?.kill();
      drag = {
        x: e.clientX,
        startPos: pos,
        lastX: e.clientX,
        lastT: performance.now(),
        v: 0,
        moved: false,
        id: e.pointerId
      };
    }

    function onPointerMove(e) {
      if (!drag) return;
      const stepPx = Math.max(cfg.cardWidth * 0.55 * scale, 40);
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) > 4) {
        drag.moved = true;
        try {
          rootEl.setPointerCapture(drag.id);
        } catch {}
      }
      if (!drag.moved) return;
      const now = performance.now();
      const dt = Math.max(now - drag.lastT, 1);
      drag.v = (e.clientX - drag.lastX) / dt;
      drag.lastX = e.clientX;
      drag.lastT = now;
      pos = drag.startPos - dx / stepPx;
      layout(pos);
    }

    function onPointerEnd() {
      if (!drag) return;
      const wasMoved = drag.moved;
      const v = drag.v;
      drag = null;
      if (!wasMoved) return;
      const stepPx = Math.max(cfg.cardWidth * 0.55 * scale, 40);
      const projected = pos - (v * 180) / stepPx;
      setFocus(Math.round(projected), true);
    }

    function onWheel(e) {
      if (count < 2) return;
      e.preventDefault();
      tween?.kill();
      const raw = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const delta = e.deltaMode === 1 ? raw * 24 : raw;
      const step = clamp(delta / (cfg.cardWidth * 0.9), -0.6, 0.6);
      pos += step;
      layout(pos);
      if (wheelTimer) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => setFocus(Math.round(pos), true), 130);
    }

    function onKeyDown(e) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateBy(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigateBy(1);
      }
    }

    rootEl.addEventListener('pointerdown', onPointerDown);
    rootEl.addEventListener('pointermove', onPointerMove);
    rootEl.addEventListener('pointerup', onPointerEnd);
    rootEl.addEventListener('pointercancel', onPointerEnd);
    rootEl.addEventListener('wheel', onWheel, { passive: false });
    rootEl.addEventListener('keydown', onKeyDown);

    const resizeObserver = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width;
      const needed = cfg.cardWidth + Math.abs(cfg.spread) * 2 + 60;
      scale = clamp(w / needed, 0.45, 1);
      layout(pos);
    });
    resizeObserver.observe(rootEl);

    // Mount to container
    container.appendChild(rootEl);
    renderDOM();

    return {
      element: rootEl,
      setItems: next => {
        rawItems = next || [];
        data = (Array.isArray(rawItems) ? rawItems : []).map(normalizeItem);
        count = data.length;
        pos = 0;
        focus = 0;
        active = 0;
        renderDOM();
      },
      setFocus,
      navigateBy,
      resize: () => {
        const w = rootEl.clientWidth || container.clientWidth || 380;
        const needed = cfg.cardWidth + Math.abs(cfg.spread) * 2 + 60;
        scale = clamp(w / needed, 0.45, 1);
        layout(pos);
      },
      destroy: () => {
        tween?.kill();
        if (wheelTimer) clearTimeout(wheelTimer);
        if (autoTimer) clearInterval(autoTimer);
        resizeObserver.disconnect();
        rootEl.removeEventListener('pointerdown', onPointerDown);
        rootEl.removeEventListener('pointermove', onPointerMove);
        rootEl.removeEventListener('pointerup', onPointerEnd);
        rootEl.removeEventListener('pointercancel', onPointerEnd);
        rootEl.removeEventListener('wheel', onWheel);
        rootEl.removeEventListener('keydown', onKeyDown);
        rootEl.remove();
      }
    };
  }

  global.createDepthCarousel = createDepthCarousel;
})(window);
