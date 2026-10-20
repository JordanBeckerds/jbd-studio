import * as THREE from "three";

/* ============================================================
   0. UTIL
============================================================ */
const lerp = (a, b, n) => (1 - n) * a + n * b;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const isTouch = matchMedia("(hover:none), (pointer:coarse)").matches;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

gsap.registerPlugin(ScrollTrigger);

/* ============================================================
   1. GRAIN OVERLAY (animated film noise)
============================================================ */
(function grain(){
  const canvas = document.getElementById("grain");
  const ctx = canvas.getContext("2d");
  let w, h;
  function size(){ w = canvas.width = innerWidth * 0.5; h = canvas.height = innerHeight * 0.5; }
  size(); addEventListener("resize", size);
  const frame = document.createElement("canvas");
  frame.width = 128; frame.height = 128;
  const fctx = frame.getContext("2d");

  function draw(){
    const id = fctx.createImageData(128,128);
    for(let i=0;i<id.data.length;i+=4){
      const v = Math.random()*255;
      id.data[i]=id.data[i+1]=id.data[i+2]=v;
      id.data[i+3]=255;
    }
    fctx.putImageData(id,0,0);
    ctx.clearRect(0,0,w,h);
    const pattern = ctx.createPattern(frame,"repeat");
    ctx.fillStyle = pattern;
    ctx.fillRect(0,0,w,h);
  }
  let last = 0;
  function loop(t){
    if(t - last > 66){ draw(); last = t; } // ~15fps is enough for grain
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();

/* ============================================================
   2. CUSTOM CURSOR
============================================================ */
(function cursor(){
  if(isTouch) return;
  const el = document.getElementById("cursor");
  const label = document.getElementById("cursorLabel");
  let mx=innerWidth/2,my=innerHeight/2, cx=mx, cy=my;
  addEventListener("mousemove", e=>{ mx=e.clientX; my=e.clientY; });
  function tick(){
    cx = lerp(cx,mx,.18); cy = lerp(cy,my,.18);
    el.style.transform = `translate(${cx}px, ${cy}px)`;
    requestAnimationFrame(tick);
  }
  tick();

  document.addEventListener("mouseover", e=>{
    const t = e.target.closest("a, button, [data-cursor], .gallery-item");
    if(!t) return;
    el.classList.add("is-active");
    const txt = t.getAttribute("data-cursor");
    if(txt){ label.textContent = txt; el.classList.add("has-label"); }
  });
  document.addEventListener("mouseout", e=>{
    const t = e.target.closest("a, button, [data-cursor], .gallery-item");
    if(!t) return;
    el.classList.remove("is-active","has-label");
  });
})();

/* ============================================================
   3. PRELOADER
============================================================ */
function runPreloader(onDone){
  const letters = document.querySelectorAll(".preloader-word span");
  const barFill = document.getElementById("preBarFill");
  const count = document.getElementById("preCount");
  const pre = document.getElementById("preloader");

  const tl = gsap.timeline({ onComplete: onDone });
  tl.to(letters, { opacity:1, y:0, duration:.8, stagger:.05, ease:"power3.out" });

  const counter = { v:0 };
  tl.to(counter, {
    v:100, duration:1.6, ease:"power2.inOut",
    onUpdate:()=>{
      const val = Math.round(counter.v);
      count.textContent = val;
      barFill.style.width = val + "%";
    }
  }, "-=0.4");

  tl.to(pre, {
    yPercent:-100, duration:1, ease:"power4.inOut", delay:.15,
    onComplete:()=> pre.remove()
  });
}

/* ============================================================
   4. LENIS SMOOTH SCROLL + SCROLLTRIGGER BRIDGE
============================================================ */
let lenis;
function initSmoothScroll(){
  if(reducedMotion || isTouch){
    ScrollTrigger.refresh();
    return;
  }
  lenis = new Lenis({ duration:1.15, smoothWheel:true, easing:(t)=>1-Math.pow(1-t,3) });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time)=>{ lenis.raf(time*1000); });
  gsap.ticker.lagSmoothing(0);
}

/* ============================================================
   4b. GLOBAL RESIZE HANDLER
   Lenis caches the page's scrollable height at init and after every
   scroll — it does NOT know when the viewport itself changes (window
   resize, fullscreen toggle, devtools/browser-chrome show/hide). Left
   alone, its virtual scroll position drifts out of sync with the real
   DOM height, which reads as pinned sections misaligning or content
   getting cut off after any resize. Re-measuring on resize keeps it,
   ScrollTrigger, and the gallery pin distance all agreed on the same
   viewport size.
============================================================ */
const onResizeCallbacks = [];
function registerResize(fn){ onResizeCallbacks.push(fn); }
(function globalResize(){
  let t;
  addEventListener("resize", ()=>{
    clearTimeout(t);
    t = setTimeout(()=>{
      onResizeCallbacks.forEach(fn=>fn());
      lenis?.resize();
      ScrollTrigger.refresh();
    }, 200);
  });
})();

/* ============================================================
   5. NAV — hide on scroll down / show on scroll up + progress rail
============================================================ */
function initNav(){
  const nav = document.getElementById("siteNav");
  const fill = document.getElementById("scrollFill");
  let lastY = 0;
  let suppressHide = false;

  ScrollTrigger.create({
    start:0, end:"max",
    onUpdate:(self)=>{
      const y = self.scroll();
      fill.style.width = (self.progress*100) + "%";
      // an anchor-jump is a single huge scroll delta, not the user scrolling
      // down — treating it as "scroll down" would hide the nav and, since
      // nothing scrolls further afterward, leave it stuck hidden.
      if(suppressHide){ nav.classList.remove("nav-hidden"); lastY = y; return; }
      if(y > lastY && y > 200){ nav.classList.add("nav-hidden"); }
      else{ nav.classList.remove("nav-hidden"); }
      lastY = y;
    }
  });

  // route every in-page anchor link through Lenis instead of letting the
  // browser jump instantly — an instant native jump desyncs Lenis's virtual
  // scroll position from the real one, which is what caused the nav to hide
  // and stay hidden after clicking certain links.
  function scrollToHash(hash){
    const target = document.querySelector(hash);
    if(!target) return;
    suppressHide = true;
    const release = ()=>{ suppressHide = false; };
    if(lenis){
      lenis.scrollTo(target, { duration:1.2, onComplete: release });
    }else{
      target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block:"start" });
      setTimeout(release, 900);
    }
  }
  document.querySelectorAll('a[href^="#"]').forEach(a=>{
    const hash = a.getAttribute("href");
    if(!hash || hash === "#") return;
    a.addEventListener("click", e=>{
      e.preventDefault();
      scrollToHash(hash);
    });
  });

  const menuBtn = document.getElementById("menuBtn");
  const overlay = document.getElementById("menuOverlay");
  const menuLinks = overlay.querySelectorAll("nav a");
  menuBtn.addEventListener("click", ()=>{
    const opening = !overlay.classList.contains("open");
    overlay.classList.toggle("open");
    menuBtn.classList.toggle("open");
    if(opening){
      gsap.fromTo(menuLinks, { opacity:0, y:24 }, { opacity:1, y:0, duration:.6, stagger:.06, delay:.15, ease:"power3.out" });
    }
  });
  overlay.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>overlay.classList.remove("open")));

  document.getElementById("toTop").addEventListener("click", ()=>{
    suppressHide = true;
    if(lenis) lenis.scrollTo(0,{duration:1.4, onComplete:()=>{ suppressHide=false; }});
    else{ window.scrollTo({top:0,behavior:"smooth"}); setTimeout(()=>{ suppressHide=false; }, 900); }
  });
}

/* ============================================================
   6. TEXT REVEALS (lines + words) on scroll
============================================================ */
function initReveals(){
  document.querySelectorAll(".hero .reveal-line").forEach((el,i)=>{
    gsap.to(el.querySelector("span"), {
      yPercent:0, duration:1.4, ease:"power4.out", delay:.2 + i*0.1
    });
  });

  // IntersectionObserver instead of a ScrollTrigger-per-element: a large
  // scroll jump (a fast fling, a resize-triggered re-layout that shifts an
  // element's trigger position after the page already scrolled past it,
  // etc.) could leave a ScrollTrigger's internal progress stuck at 0 even
  // once genuinely in view, which permanently hid that line of text. IO
  // tracks actual visibility directly and isn't subject to that class of bug.
  const revealIO = new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting) return;
      gsap.to(entry.target.querySelector("span"), { yPercent:0, duration:1.1, ease:"power4.out" });
      revealIO.unobserve(entry.target);
    });
  }, { threshold:0, rootMargin:"0px 0px 15% 0px" });
  document.querySelectorAll("section:not(.hero) .reveal-line").forEach(el=> revealIO.observe(el));

  // Safety net: whatever the exact cause (rAF/ticker throttled in a
  // backgrounded devtools panel, a missed intersection, anything) content
  // must never stay permanently hidden behind an unplayed reveal animation.
  // gsap.set() writes the final style immediately — it doesn't need the
  // ticker to advance frames the way .to()/.fromTo() do — so this forces
  // real visibility regardless of whether the animation system is running.
  setTimeout(()=>{
    document.querySelectorAll(".reveal-line > span").forEach(span=>{
      gsap.set(span, { yPercent:0 });
    });
  }, 2000);

  gsap.utils.toArray(".sw").forEach((w,i)=>{
    gsap.fromTo(w, { opacity:.15 }, {
      opacity:1, duration:.4, ease:"none",
      scrollTrigger:{
        trigger:".statement", start:"top 70%", end:"top 15%", scrub:true
      },
      delay:i*0.005
    });
  });

  document.querySelectorAll(".stat b").forEach(el=>{
    const target = +el.dataset.count;
    ScrollTrigger.create({
      trigger:el, start:"top 90%", once:true,
      onEnter:()=>{
        gsap.to({v:0}, { v:target, duration:1.8, ease:"power2.out",
          onUpdate:function(){ el.textContent = Math.round(this.targets()[0].v); } });
      }
    });
  });
}

/* ============================================================
   7. MAGNETIC BUTTONS
============================================================ */
function initMagnetic(){
  if(isTouch) return;
  document.querySelectorAll(".btn-magnetic").forEach(btn=>{
    btn.addEventListener("mousemove", e=>{
      const r = btn.getBoundingClientRect();
      const x = e.clientX - r.left - r.width/2;
      const y = e.clientY - r.top - r.height/2;
      gsap.to(btn, { x:x*0.35, y:y*0.5, duration:.5, ease:"power3.out" });
      gsap.to(btn.querySelector("span"), { x:x*0.15, y:y*0.2, duration:.5, ease:"power3.out" });
    });
    btn.addEventListener("mouseleave", ()=>{
      gsap.to(btn, { x:0, y:0, duration:.6, ease:"elastic.out(1,0.4)" });
      gsap.to(btn.querySelector("span"), { x:0, y:0, duration:.6, ease:"elastic.out(1,0.4)" });
    });
  });
}

/* ============================================================
   8. SERVICE CARD 3D TILT
============================================================ */
function initTilt(){
  if(isTouch) return;
  document.querySelectorAll("[data-tilt]").forEach(card=>{
    card.style.perspective = "800px";
    card.addEventListener("mousemove", e=>{
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left)/r.width - .5;
      const py = (e.clientY - r.top)/r.height - .5;
      gsap.to(card, { rotateX: py*-4, rotateY: px*6, duration:.6, ease:"power2.out", transformPerspective:800 });
    });
    card.addEventListener("mouseleave", ()=>{
      gsap.to(card, { rotateX:0, rotateY:0, duration:.8, ease:"power3.out" });
    });
  });
}

/* ============================================================
   9. PROCEDURAL ART — canvas 2D generative "photographs"
   (fictional studio, no stock imagery: each work is a generated
   gold/ink abstract composition unique per seed)
============================================================ */
function paintWork(canvas, seed, w=900, h=700){
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  let s = seed*9301+49297;
  const rnd = ()=> ( (s = (s*9301+49297) % 233280) / 233280 );

  const palettes = [
    ["#0c0e13","#241a10","#d9b26b","#e8c88c"],
    ["#0a0a0f","#1f180f","#8c6a3d","#f0f0f5"],
    ["#111118","#241a12","#d9b26b","#8c6a3d"],
    ["#0a0a0f","#201812","#f2babd","#1a1a24"],
  ];
  const pal = palettes[seed % palettes.length];

  const g = ctx.createLinearGradient(0,0,w*rnd(),h);
  g.addColorStop(0, pal[0]); g.addColorStop(1, pal[1]);
  ctx.fillStyle = g; ctx.fillRect(0,0,w,h);

  // tight, contained glow — kept small and closer to opaque at the core so
  // it reads as a defined accent rather than a soft ambient haze (a wide
  // low-opacity radial wash across the whole card looked like fog/mist).
  const rg = ctx.createRadialGradient(w*(0.3+rnd()*0.4), h*(0.3+rnd()*0.4), 0, w*(0.3+rnd()*0.4), h*(0.3+rnd()*0.4), w*0.32);
  rg.addColorStop(0, pal[2]+"40"); rg.addColorStop(1,"transparent");
  ctx.fillStyle = rg; ctx.fillRect(0,0,w,h);

  // blueprint grid, more defined (dev/tech feel, in place of editorial cross-lines)
  ctx.strokeStyle = pal[3]+"38";
  ctx.lineWidth = 1;
  const step = 48 + Math.floor(rnd()*24);
  const offX = rnd()*step, offY = rnd()*step;
  for(let x=offX; x<w; x+=step){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
  for(let y=offY; y<h; y+=step){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }

  // focal shape — sharper core with a mid stop instead of a single soft falloff
  ctx.beginPath();
  const cx = w*(0.3+rnd()*0.4), cy = h*(0.3+rnd()*0.4), rad = Math.min(w,h)*(0.1+rnd()*0.12);
  ctx.arc(cx,cy,rad,0,Math.PI*2);
  const cg = ctx.createRadialGradient(cx,cy,0,cx,cy,rad);
  cg.addColorStop(0, pal[3]); cg.addColorStop(0.55, pal[3]+"cc"); cg.addColorStop(1, pal[2]+"00");
  ctx.fillStyle = cg; ctx.fill();

  // grain speckle
  for(let i=0;i<1400;i++){
    ctx.fillStyle = `rgba(255,255,255,${rnd()*0.035})`;
    ctx.fillRect(rnd()*w, rnd()*h, 1, 1);
  }

  // vignette
  const vg = ctx.createRadialGradient(w/2,h/2,h*0.2,w/2,h/2,h*0.75);
  vg.addColorStop(0,"transparent"); vg.addColorStop(1,"rgba(0,0,0,.5)");
  ctx.fillStyle = vg; ctx.fillRect(0,0,w,h);
}

// Info-Café's own cover — same atmospheric background as the gallery art,
// but with the real infocafe.shop favicon as the centerpiece instead of an
// abstract shape, so it reads as that specific business, not a placeholder.
function paintInfoCafeCover(canvas, w=800, h=1000){
  paintWork(canvas, seedFor("info-cafe-cover"), w, h);
  const ctx = canvas.getContext("2d");
  const logo = new Image();
  logo.onload = ()=>{
    const size = Math.min(w,h) * 0.32;
    const cx = w/2, cy = h*0.44;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.45)";
    ctx.shadowBlur = 40;
    ctx.beginPath();
    ctx.arc(cx, cy, size*0.62, 0, Math.PI*2);
    ctx.fillStyle = "rgba(10,10,15,.55)";
    ctx.fill();
    ctx.restore();
    ctx.drawImage(logo, cx-size/2, cy-size/2, size, size);
  };
  logo.onerror = ()=>{ /* falls back to the plain generative background */ };
  logo.src = "https://www.google.com/s2/favicons?sz=256&domain=infocafe.shop";
}

// Real project data, pulled live from the same public preview API the
// jbd-dev site itself uses — falls back to a static snapshot of the same
// data if the fetch fails (offline, API down, etc.).
const PREVIEW_API = "https://preview.jbeckerdamour.com/api/public/previews";
const FALLBACK_WORKS = [
  { name:"Info Café", tagline:"Boutique informatique & formation à Pau", slug:"info-cafe", url:"https://infocafe.shop", protected:false },
  { name:"Le Petit Oasis", tagline:"Association loi 1901 — écoute et solidarité", slug:"le-petit-oasis", url:"https://preview.jbeckerdamour.com/le-petit-oasis/", protected:false },
  { name:"Salon Patte Douce", tagline:"Le bien-être de votre compagnon, notre passion.", slug:"salon-patte-douce-pau", url:"https://preview.jbeckerdamour.com/salon-patte-douce-pau", protected:true },
  { name:"Campagne Delphine", tagline:"Magnétisme & médiumnité", slug:"campagne-delphine", url:"https://preview.jbeckerdamour.com/campagne-delphine", protected:true },
  { name:"Entreprise Weiss élagage", tagline:"Élagage, taille d'arbres et entretien extérieur", slug:"entreprise-weiss-elagage", url:"https://preview.jbeckerdamour.com/entreprise-weiss-elagage", protected:true },
];

function seedFor(str){
  let h = 0;
  for(let i=0;i<str.length;i++) h = (h*31 + str.charCodeAt(i)) >>> 0;
  return h;
}

async function fetchWorks(){
  try{
    const res = await fetch(PREVIEW_API);
    if(!res.ok) throw new Error("bad status");
    const data = await res.json();
    if(!Array.isArray(data.previews) || !data.previews.length) throw new Error("empty");
    return data.previews.map(p=>({
      name:p.name, tagline:p.tagline || p.description || "", slug:p.slug, url:p.url, protected:!!p.protected
    }));
  }catch(err){
    return FALLBACK_WORKS;
  }
}

async function buildGallery(){
  const track = document.getElementById("galleryTrack");
  track.innerHTML = "";
  const works = await fetchWorks();
  works.forEach((w, i)=>{
    const item = document.createElement("a");
    item.className = "gallery-item";
    item.href = w.url;
    item.target = "_blank";
    item.rel = "noreferrer";
    item.setAttribute("data-cursor","Voir");
    const canvas = document.createElement("canvas");
    item.appendChild(canvas);

    // real favicon from the project's own domain — an honest brand cue
    // instead of guessing at colors/logos we don't actually have.
    let domain = null;
    try{ domain = new URL(w.url).hostname; }catch(err){ /* no host to fetch a favicon for */ }
    if(domain){
      const logo = document.createElement("img");
      logo.className = "gallery-logo";
      logo.src = `https://www.google.com/s2/favicons?sz=128&domain=${domain}`;
      logo.alt = "";
      logo.loading = "lazy";
      logo.onerror = ()=> logo.remove();
      item.appendChild(logo);
    }

    const cap = document.createElement("div");
    cap.className = "gallery-caption";
    const lock = w.protected ? ' <span class="gallery-lock">🔒 Accès client</span>' : "";
    cap.innerHTML = `<div><div class="g-index">N°${String(i+1).padStart(2,"0")}${lock}</div><h3>${w.name}</h3></div><p>${w.tagline}</p>`;
    item.appendChild(cap);
    track.appendChild(item);
    paintWork(canvas, seedFor(w.slug || w.name));

    if(!isTouch){
      item.addEventListener("mousemove", e=>{
        const r = item.getBoundingClientRect();
        const px = (e.clientX-r.left)/r.width - .5;
        const py = (e.clientY-r.top)/r.height - .5;
        gsap.to(canvas, { x:px*24, y:py*24, scale:1.08, duration:.7, ease:"power3.out" });
      });
      item.addEventListener("mouseleave", ()=>{
        gsap.to(canvas, { x:0, y:0, scale:1, duration:.8, ease:"power3.out" });
      });
    }
  });
}

/* ============================================================
   10. HORIZONTAL SCROLL-PINNED GALLERY (desktop only — see CSS
   media query for the mobile native-swipe fallback)
============================================================ */
function initGalleryScroll(){
  const track = document.getElementById("galleryTrack");
  const progressFill = document.getElementById("galleryProgressFill");
  const work = document.getElementById("work");
  const isMobileLayout = ()=> isTouch || innerWidth <= 860;

  function build(){
    const trackWidth = track.scrollWidth;
    const distance = trackWidth - innerWidth + innerWidth*0.06;
    return distance;
  }

  let st;
  function setup(){
    if(isMobileLayout()){
      if(st){ st.kill(); st = null; }
      gsap.set(track, { x:0 });
      progressFill.style.width = "0%";
      return;
    }
    if(st) st.kill();
    const distance = build();
    st = ScrollTrigger.create({
      trigger: work,
      start: "top top",
      end: () => "+=" + (distance + innerHeight*0.4),
      pin: true,
      scrub: 0.6,
      onUpdate:(self)=>{
        gsap.set(track, { x: -distance * self.progress });
        progressFill.style.width = (self.progress*100) + "%";
      }
    });
  }
  setup();
  registerResize(setup);
}

/* ============================================================
   10b. TIMELINE — pinned horizontal "frise chronologique" on
   desktop (same pin+scrub mechanic as the gallery) with a
   background glow that slides underneath as chapters advance;
   plain native swipe on mobile, same reasoning as the gallery.
============================================================ */
function initTimeline(){
  const rail = document.getElementById("timelineRail");
  const track = document.getElementById("timelineTrack");
  const section = document.getElementById("parcours");
  const bg = document.getElementById("timelineBg");
  const lineFill = document.getElementById("timelineLineFill");
  const items = Array.from(document.querySelectorAll(".timeline-item"));
  const isMobileLayout = ()=> isTouch || innerWidth <= 860;

  function setActive(progress){
    const idx = Math.min(items.length-1, Math.floor(progress * items.length));
    items.forEach((it,i)=> it.classList.toggle("is-active", i === idx));
  }

  let st;
  function setup(){
    if(isMobileLayout()){
      if(st){ st.kill(); st = null; }
      gsap.set(track, { x:0 });
      gsap.set(bg, { x:0 });
      items.forEach(it=>it.classList.add("is-active"));
      return;
    }
    if(st) st.kill();
    const distance = track.scrollWidth - innerWidth + innerWidth*0.06;
    st = ScrollTrigger.create({
      trigger: section,
      start: "top top",
      end: () => "+=" + (distance + innerHeight*0.5),
      pin: true,
      scrub: 0.6,
      onUpdate:(self)=>{
        gsap.set(track, { x: -distance * self.progress });
        gsap.set(bg, { x: `${self.progress*70}vw`, y: `${Math.sin(self.progress*Math.PI)*-10}%` });
        lineFill.style.width = (self.progress*100) + "%";
        setActive(self.progress);
      }
    });
  }
  setup();
  registerResize(setup);
}

/* ============================================================
   10c. SKILLS — live GitHub profile + top repos
============================================================ */
async function initSkillsGithub(){
  const GH_USER = "JordanBeckerds";
  const holder = document.getElementById("skillsGithub");
  try{
    const [profileRes, reposRes] = await Promise.all([
      fetch(`https://api.github.com/users/${GH_USER}`),
      fetch(`https://api.github.com/users/${GH_USER}/repos?sort=updated&per_page=6`)
    ]);
    if(!profileRes.ok || !reposRes.ok) throw new Error("github api error");
    const profile = await profileRes.json();
    const repos = (await reposRes.json()).filter(r=>!r.fork).slice(0,6);

    const memberSince = new Date(profile.created_at).getFullYear();

    holder.innerHTML = `
      <div class="gh-profile">
        <img class="gh-avatar" src="${profile.avatar_url}" alt="${profile.name || GH_USER}" loading="lazy">
        <div>
          <div class="gh-name">${profile.name || GH_USER}</div>
          <div class="gh-handle">@${profile.login}</div>
          ${profile.bio ? `<p class="gh-bio">${profile.bio}</p>` : ""}
        </div>
        <div class="gh-stats">
          <div><b>${profile.public_repos}</b><span>Dépôts publics</span></div>
          <div><b>${memberSince}</b><span>Sur GitHub depuis</span></div>
        </div>
      </div>
      <div class="gh-repos">
        ${repos.map(r=>`
          <a class="gh-repo" href="${r.html_url}" target="_blank" rel="noreferrer" data-cursor="Voir">
            <span class="gh-repo-name">${r.name}</span>
            <p class="gh-repo-desc">${r.description || "Pas de description."}</p>
            <div class="gh-repo-meta">
              ${r.language ? `<span>${r.language}</span>` : ""}
              <span>★ ${r.stargazers_count}</span>
            </div>
          </a>
        `).join("")}
      </div>
    `;
  }catch(err){
    holder.innerHTML = `<div class="gh-error">Profil GitHub temporairement indisponible — <a href="https://github.com/${GH_USER}" target="_blank" rel="noreferrer" style="color:var(--accent-2)">voir sur GitHub ↗</a></div>`;
  }
}

/* ============================================================
   11. THREE.JS — HERO SCENE
   A faceted indigo crystal core wrapped in a constellation of
   connected nodes — a network/graph motif rather than a jewel —
   reacting to pointer + scroll.
============================================================ */
function initHeroScene(){
  const canvas = document.getElementById("webgl-hero");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true });
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.1, 100);
  camera.position.set(0,0,9);

  const hemi = new THREE.HemisphereLight(0xe8c88c, 0x0a0a0f, 1.4);
  scene.add(hemi);
  // several soft, lower-intensity lights spread around the object read as an even
  // sheen; one strong point light on a high-metalness/low-roughness surface produces
  // a hard specular streak that sweeps across the mesh as the camera/light angle shifts.
  const key = new THREE.PointLight(0xe8c88c, 22, 30); key.position.set(5,5,6); scene.add(key);
  const rim = new THREE.PointLight(0x8c6a3d, 14, 30); rim.position.set(-6,-3,-4); scene.add(rim);
  const fill = new THREE.PointLight(0xeef0f6, 10, 30); fill.position.set(-3,4,-6); scene.add(fill);
  const under = new THREE.PointLight(0x5c4426, 8, 24); under.position.set(2,-5,3); scene.add(under);

  const geo = new THREE.IcosahedronGeometry(2.15, 1);
  const mat = new THREE.MeshPhysicalMaterial({
    color:0xd9b26b, metalness:0.55, roughness:0.42, clearcoat:0.2, clearcoatRoughness:0.6,
    flatShading:true, envMapIntensity:1.1
  });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);

  // wireframe ghost shell for depth — a light, near-white tone reads fine
  // on a dark page but disappears on a white one, so this uses a darker
  // warm tone instead so it stays visible against the light background.
  const wire = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.7, 1),
    new THREE.MeshBasicMaterial({ color:0x5c4426, transparent:true, opacity:0.16, wireframe:true })
  );
  scene.add(wire);

  // node constellation — a sparse point cloud with edges drawn between
  // nearby nodes, evoking a network/graph rather than ambient dust.
  const NODE_COUNT = 90;
  const nodes = [];
  for(let i=0;i<NODE_COUNT;i++){
    nodes.push(new THREE.Vector3(
      (Math.random()-0.5)*14,
      (Math.random()-0.5)*10,
      (Math.random()-0.5)*10 - 3
    ));
  }
  const pGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(NODE_COUNT*3);
  nodes.forEach((v,i)=>{ positions[i*3]=v.x; positions[i*3+1]=v.y; positions[i*3+2]=v.z; });
  pGeo.setAttribute("position", new THREE.BufferAttribute(positions,3));
  const pMat = new THREE.PointsMaterial({ color:0x8c6a3d, size:0.05, transparent:true, opacity:0.85 });
  const points = new THREE.Points(pGeo, pMat);
  scene.add(points);

  const linePositions = [];
  const LINK_DIST = 3.4;
  for(let i=0;i<NODE_COUNT;i++){
    for(let j=i+1;j<NODE_COUNT;j++){
      if(nodes[i].distanceTo(nodes[j]) < LINK_DIST){
        linePositions.push(nodes[i].x,nodes[i].y,nodes[i].z, nodes[j].x,nodes[j].y,nodes[j].z);
      }
    }
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(linePositions),3));
  const lineMat = new THREE.LineBasicMaterial({ color:0x8c6a3d, transparent:true, opacity:0.3 });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  scene.add(lines);

  let mx=0,my=0, tScroll=0;
  addEventListener("mousemove", e=>{
    mx = (e.clientX/innerWidth - .5);
    my = (e.clientY/innerHeight - .5);
  });
  ScrollTrigger.create({
    trigger:".hero", start:"top top", end:"bottom top",
    onUpdate:self=>{ tScroll = self.progress; }
  });

  function resize(){
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    renderer.setSize(w,h,false);
    camera.aspect = w/h; camera.updateProjectionMatrix();
  }
  resize(); addEventListener("resize", resize);

  const clock = new THREE.Clock();
  function animate(){
    const t = clock.getElapsedTime();
    mesh.rotation.y = t*0.14 + mx*0.6;
    mesh.rotation.x = t*0.08 + my*0.4;
    mesh.rotation.z = tScroll * Math.PI * 0.3;
    wire.rotation.copy(mesh.rotation);
    mesh.position.y = Math.sin(t*0.5)*0.15 - tScroll*1.4;
    wire.position.y = mesh.position.y;
    points.rotation.y = t*0.02;
    lines.rotation.y = t*0.02;
    camera.position.x = lerp(camera.position.x, mx*1.2, 0.04);
    camera.position.y = lerp(camera.position.y, -my*1.0, 0.04);
    camera.lookAt(0,0,0);
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();
}

/* ============================================================
   12. THREE.JS — STUDIO SCENE (slow rotating gold fragment)
============================================================ */
function initStudioScene(){
  const canvas = document.getElementById("webgl-studio");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true });
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  camera.position.set(0,0,6.5);

  scene.add(new THREE.HemisphereLight(0xe8c88c,0x0a0a0f,1.3));
  const key = new THREE.PointLight(0xe8c88c,26,20); key.position.set(4,3,5); scene.add(key);
  const fill = new THREE.PointLight(0xeef0f6,10,20); fill.position.set(-4,-2,4); scene.add(fill);

  const group = new THREE.Group();
  const shapeGeo = new THREE.OctahedronGeometry(1.9, 0);
  const shapeMat = new THREE.MeshPhysicalMaterial({ color:0xd9b26b, metalness:0.6, roughness:0.4, flatShading:true });
  const shape = new THREE.Mesh(shapeGeo, shapeMat);
  group.add(shape);
  const shell = new THREE.Mesh(new THREE.OctahedronGeometry(2.5,0), new THREE.MeshBasicMaterial({ color:0x5c4426, wireframe:true, transparent:true, opacity:0.18 }));
  group.add(shell);
  scene.add(group);

  function resize(){
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w,h,false);
    camera.aspect = w/h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas);
  resize();

  let progress = 0;
  ScrollTrigger.create({ trigger:"#studio", start:"top bottom", end:"bottom top", onUpdate:self=>progress=self.progress });

  const clock = new THREE.Clock();
  function animate(){
    const t = clock.getElapsedTime();
    group.rotation.y = t*0.25;
    group.rotation.x = 0.3 + Math.sin(t*0.4)*0.08;
    group.position.y = (progress-0.5) * 0.6;
    renderer.render(scene,camera);
    requestAnimationFrame(animate);
  }
  animate();
}

/* ============================================================
   13. THREE.JS — CONTACT SCENE (ambient gold particle waves)
============================================================ */
function initContactScene(){
  const canvas = document.getElementById("webgl-contact");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true });
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, innerWidth/innerHeight, 0.1, 50);
  camera.position.set(0,3,9);
  camera.lookAt(0,0,0);

  const COUNT_X = 64, COUNT_Z = 40;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(COUNT_X*COUNT_Z*3);
  let idx=0;
  for(let x=0;x<COUNT_X;x++){
    for(let z=0;z<COUNT_Z;z++){
      pos[idx++] = (x-COUNT_X/2)*0.32;
      pos[idx++] = 0;
      pos[idx++] = (z-COUNT_Z/2)*0.32;
    }
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos,3));
  const mat = new THREE.PointsMaterial({ color:0x8c6a3d, size:0.035, transparent:true, opacity:0.65 });
  const points = new THREE.Points(geo,mat);
  scene.add(points);

  function resize(){
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    renderer.setSize(w,h,false);
    camera.aspect = w/h; camera.updateProjectionMatrix();
  }
  resize(); addEventListener("resize", resize);

  const clock = new THREE.Clock();
  const arr = geo.attributes.position;
  function animate(){
    const t = clock.getElapsedTime();
    for(let i=0;i<arr.count;i++){
      const x = arr.getX(i), z = arr.getZ(i);
      arr.setY(i, Math.sin(x*0.5+t*0.6)*0.35 + Math.cos(z*0.5+t*0.4)*0.35);
    }
    arr.needsUpdate = true;
    points.rotation.y = t*0.02;
    renderer.render(scene,camera);
    requestAnimationFrame(animate);
  }
  animate();
}

/* ============================================================
   INIT SEQUENCE
============================================================ */
async function boot(){
  initNav();
  initReveals();
  initMagnetic();
  initTilt();
  await buildGallery();
  initGalleryScroll();
  initTimeline();
  const icCanvas = document.getElementById("icCanvas");
  if(icCanvas) paintInfoCafeCover(icCanvas, 800, 1000);
  initHeroScene();
  initStudioScene();
  initContactScene();
  initSmoothScroll();
  ScrollTrigger.refresh();
  // GitHub data arrives after first paint — its section sits above other
  // (unpinned) sections, so a second refresh keeps their trigger offsets
  // accurate once its real height is known.
  initSkillsGithub().then(()=> ScrollTrigger.refresh());
}

let booted = false;
function bootOnce(){
  if(booted) return;
  booted = true;
  const pre = document.getElementById("preloader");
  if(pre){ gsap.killTweensOf(pre); pre.remove(); }
  boot();
}

function start(){
  if(reducedMotion){
    bootOnce();
    return;
  }
  runPreloader(bootOnce);
  // safety net: never let a slow/backgrounded tab (rAF throttled) strand
  // visitors behind the preloader — timers still fire, rAF may not.
  setTimeout(bootOnce, 6000);
}

if(document.readyState === "complete"){ start(); }
else{ window.addEventListener("load", start); }
