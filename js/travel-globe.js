/**
 * Travel map: Three.js globe, localStorage trips, in-column detail panel.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

(function () {
  "use strict";

  var STORAGE_KEY = "katana-travel-trips";
  /** 同源贴图优先，避免仅依赖外网 CDN 时 CORS/网络导致始终占位 */
  function getEarthTextureUrls() {
    var base =
      typeof document !== "undefined" && document.baseURI
        ? document.baseURI
        : typeof window !== "undefined" && window.location
          ? window.location.href
          : "";
    var local = base ? new URL("textures/earth_day_4096.jpg", base).href : "textures/earth_day_4096.jpg";
    return [
      local,
      "https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/textures/planets/earth_day_4096.jpg",
      "https://threejs.org/examples/textures/planets/earth_day_4096.jpg",
      "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_day_4096.jpg",
    ];
  }

  var earthTexLoadGen = 0;

  function createPlaceholderEarthTexture() {
    var c = document.createElement("canvas");
    c.width = 512;
    c.height = 256;
    var ctx = c.getContext("2d");
    if (!ctx) return null;
    var g = ctx.createLinearGradient(0, 0, c.width, c.height);
    g.addColorStop(0, "#1a3a8a");
    g.addColorStop(0.35, "#3d6ad4");
    g.addColorStop(0.55, "#6b8fe8");
    g.addColorStop(0.72, "#2d5099");
    g.addColorStop(1, "#0f1f4d");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalAlpha = 0.18;
    var i;
    for (i = 0; i < 60; i++) {
      ctx.fillStyle = i % 2 ? "#c8d6fa" : "#9db6f2";
      ctx.fillRect((i * 37) % c.width, (i * 23) % c.height, 80, 40);
    }
    ctx.globalAlpha = 1;
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  function stylizeEarthToCanvas(img) {
    var maxW = 1100;
    var w = img.width || img.videoWidth;
    var h = img.height || img.videoHeight;
    if (!w || !h) return null;
    if (w > maxW) {
      h = Math.round((h * maxW) / w);
      w = maxW;
    }
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    var ctx = c.getContext("2d");
    if (!ctx) return null;
    try {
      ctx.drawImage(img, 0, 0, w, h);
    } catch (e) {
      return null;
    }
    try {
      var imgData = ctx.getImageData(0, 0, w, h);
      var d = imgData.data;
      var levels = 7;
      var step = 255 / Math.max(1, levels - 1);
      var j;
      for (j = 0; j < d.length; j += 4) {
        d[j] = Math.min(255, Math.round(d[j] / step) * step);
        d[j + 1] = Math.min(255, Math.round(d[j + 1] / step) * step);
        d[j + 2] = Math.min(255, Math.round(d[j + 2] / step) * step);
        var lum = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
        if (lum < 95) {
          d[j] = d[j] * 0.82 + 28;
          d[j + 1] = d[j + 1] * 0.88 + 22;
          d[j + 2] = Math.min(255, d[j + 2] * 1.1 + 26);
        } else if (lum > 175) {
          d[j] = Math.min(255, d[j] * 1.04 + 8);
          d[j + 1] = Math.min(255, d[j + 1] * 1.02 + 4);
          d[j + 2] = Math.min(255, d[j + 2] * 1.02);
        } else {
          d[j + 1] = d[j + 1] * 0.96 + 6;
          d[j + 2] = Math.min(255, d[j + 2] * 1.05 + 10);
        }
      }
      ctx.putImageData(imgData, 0, 0);
    } catch (err) {
      /* 跨域等：保留已绘制原图 */
    }
    var out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    var octx = out.getContext("2d");
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = "high";
    octx.drawImage(c, 0, 0);
    return out;
  }

  function finalizeEarthTextureFromImage(tex, sphereMat, renderer) {
    tex.colorSpace = THREE.SRGBColorSpace;
    if (renderer && renderer.capabilities) {
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    if (sphereMat.map && sphereMat.userData && sphereMat.userData.isPlaceholder) {
      sphereMat.map.dispose();
    }
    var img = tex.image;
    var canvas = stylizeEarthToCanvas(img);
    if (canvas) {
      var ctex = new THREE.CanvasTexture(canvas);
      ctex.colorSpace = THREE.SRGBColorSpace;
      ctex.needsUpdate = true;
      tex.dispose();
      sphereMat.map = ctex;
    } else {
      sphereMat.map = tex;
    }
    sphereMat.userData = sphereMat.userData || {};
    sphereMat.userData.isPlaceholder = false;
    sphereMat.userData.hasRealMap = true;
    sphereMat.color.setHex(0xffffff);
    sphereMat.emissive.setHex(0x000000);
    sphereMat.emissiveIntensity = 0;
    sphereMat.needsUpdate = true;
  }

  function tryLoadEarthTexture(urls, index, loader, sphereMat, renderer, onDone, shouldApply) {
    if (!urls || index >= urls.length) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("地球贴图全部加载失败，保留占位纹理。");
      }
      if (typeof onDone === "function") onDone();
      return;
    }
    var url = urls[index];
    loader.load(
      url,
      function (tex) {
        if (typeof shouldApply === "function" && !shouldApply()) {
          tex.dispose();
          if (typeof onDone === "function") onDone();
          return;
        }
        try {
          finalizeEarthTextureFromImage(tex, sphereMat, renderer);
        } catch (err) {
          if (typeof console !== "undefined" && console.warn) {
            console.warn("地球贴图后处理失败，使用原图。", err);
          }
          tex.colorSpace = THREE.SRGBColorSpace;
          if (sphereMat.map && sphereMat.userData && sphereMat.userData.isPlaceholder) {
            sphereMat.map.dispose();
          }
          sphereMat.map = tex;
          sphereMat.userData = sphereMat.userData || {};
          sphereMat.userData.isPlaceholder = false;
          sphereMat.userData.hasRealMap = true;
          sphereMat.color.setHex(0xffffff);
          sphereMat.emissive.setHex(0x000000);
          sphereMat.emissiveIntensity = 0;
          sphereMat.needsUpdate = true;
        }
        if (typeof onDone === "function") onDone();
      },
      undefined,
      function () {
        tryLoadEarthTexture(urls, index + 1, loader, sphereMat, renderer, onDone, shouldApply);
      }
    );
  }

  var ROUTES = ["home", "travel", "movies", "books", "french"];

  var canvas = document.getElementById("travel-globe-canvas");
  var detailEmptyEl = document.getElementById("travel-detail-empty");
  var detailContentEl = document.getElementById("travel-detail-content");
  var form = document.getElementById("travel-form");
  var tripList = document.getElementById("travel-trip-list");
  var listEmpty = document.getElementById("travel-list-empty");

  var scene = null;
  var camera = null;
  var renderer = null;
  var controls = null;
  var earthGroup = null;
  var markersGroup = null;
  var animationId = null;
  var resizeObserver = null;
  var ready = false;
  var selectedId = null;
  var editingId = null;
  var editingOriginalPlace = "";
  var pointerStart = null;
  var lastPickAt = 0;

  var formTitleEl = document.getElementById("travel-form-title");
  var cancelEditBtn = document.getElementById("travel-cancel-edit");
  var photoHintEl = document.getElementById("travel-photo-hint");
  var photoHintDefaultEl = document.getElementById("travel-photo-hint-default");
  var MAX_TRIP_PHOTOS = 8;

  function getRouteFromHash() {
    var h = (window.location.hash || "").replace(/^#\/?/, "").toLowerCase();
    if (!h) return "home";
    var key = h.split("/")[0];
    return ROUTES.indexOf(key) !== -1 ? key : "home";
  }

  function loadTrips() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  function saveTrips(trips) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
    } catch (e) {
      alert("保存失败：本地存储可能已满，请减少照片数量或缩短随笔。");
    }
  }

  function latLonToVector3(lat, lon, radius) {
    var phi = (90 - lat) * (Math.PI / 180);
    var theta = (lon + 180) * (Math.PI / 180);
    var x = -(radius * Math.sin(phi) * Math.cos(theta));
    var z = radius * Math.sin(phi) * Math.sin(theta);
    var y = radius * Math.cos(phi);
    return new THREE.Vector3(x, y, z);
  }

  function compressImageFile(file, maxSide, quality, callback) {
    if (!file || !file.type || file.type.indexOf("image/") !== 0) {
      callback(null);
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth;
        var h = img.naturalHeight;
        if (!w || !h) {
          callback(null);
          return;
        }
        var scale = Math.min(1, maxSide / Math.max(w, h));
        var cw = Math.round(w * scale);
        var ch = Math.round(h * scale);
        var c = document.createElement("canvas");
        c.width = cw;
        c.height = ch;
        var ctx = c.getContext("2d");
        if (!ctx) {
          callback(null);
          return;
        }
        ctx.drawImage(img, 0, 0, cw, ch);
        try {
          var dataUrl = c.toDataURL("image/jpeg", quality);
          callback(dataUrl);
        } catch (err) {
          callback(null);
        }
      };
      img.onerror = function () {
        callback(null);
      };
      img.src = reader.result;
    };
    reader.onerror = function () {
      callback(null);
    };
    reader.readAsDataURL(file);
  }

  /** Normalize legacy photoDataUrl + photos[] into a photos array. */
  function getTripPhotos(trip) {
    if (!trip) return [];
    if (Array.isArray(trip.photos) && trip.photos.length) {
      return trip.photos.filter(function (p) {
        return typeof p === "string" && p;
      });
    }
    if (trip.photoDataUrl) return [trip.photoDataUrl];
    return [];
  }

  function compressImageFiles(files, maxSide, quality, callback) {
    var list = Array.prototype.slice.call(files || [], 0).filter(function (f) {
      return f && f.type && f.type.indexOf("image/") === 0;
    });
    if (!list.length) {
      callback([]);
      return;
    }
    if (list.length > MAX_TRIP_PHOTOS) {
      list = list.slice(0, MAX_TRIP_PHOTOS);
    }
    var results = [];
    var i = 0;
    function next() {
      if (i >= list.length) {
        callback(results);
        return;
      }
      compressImageFile(list[i], maxSide, quality, function (dataUrl) {
        if (dataUrl) results.push(dataUrl);
        i++;
        next();
      });
    }
    next();
  }

  function formatGeocodeLabel(r) {
    if (!r) return "";
    var parts = [];
    if (r.name) parts.push(r.name);
    if (r.admin1 && r.admin1 !== r.name) parts.push(r.admin1);
    if (r.country) parts.push(r.country);
    return parts.length ? parts.join(" · ") : "";
  }

  function geocodePlace(query) {
    var q = query.trim();
    if (!q) return Promise.resolve(null);
    var url =
      "https://geocoding-api.open-meteo.com/v1/search?name=" +
      encodeURIComponent(q) +
      "&count=5&language=zh&format=json";
    return fetch(url, { method: "GET" }).then(function (res) {
      if (!res.ok) throw new Error("geocode_http");
      return res.json();
    }).then(function (data) {
      if (!data || !data.results || !data.results.length) return null;
      var r = data.results[0];
      var lat = r.latitude;
      var lon = r.longitude;
      if (typeof lat !== "number" || typeof lon !== "number") return null;
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
      var label = formatGeocodeLabel(r);
      if (!label) label = q;
      return { lat: lat, lon: lon, label: label };
    });
  }

  function clearMarkers3D() {
    if (!markersGroup) return;
    while (markersGroup.children.length) {
      var o = markersGroup.children[0];
      markersGroup.remove(o);
      o.traverse(function (child) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(function (m) { m.dispose(); });
          else child.material.dispose();
        }
      });
    }
  }

  function makeMarkerMesh(trip) {
    var g = new THREE.Group();
    var pos = latLonToVector3(trip.lat, trip.lon, 1.035);
    g.position.copy(pos);
    g.userData.tripId = trip.id;

    var core = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 20, 20),
      new THREE.MeshStandardMaterial({
        color: 0xe8eefc,
        emissive: 0x3d6ad4,
        emissiveIntensity: 0.85,
        metalness: 0.15,
        roughness: 0.35,
      })
    );
    g.add(core);

    var halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 16, 16),
      new THREE.MeshBasicMaterial({
        color: 0x9db6f2,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      })
    );
    g.add(halo);

    /* 不可见放大碰撞体：标记在屏幕上极小，纯射线很难点中 */
    var hitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    var hitSphere = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 20), hitMat);
    hitSphere.name = "marker-hit";
    g.add(hitSphere);

    return g;
  }

  function rebuildMarkers(trips) {
    clearMarkers3D();
    if (!markersGroup) return;
    trips.forEach(function (t) {
      markersGroup.add(makeMarkerMesh(t));
    });
  }

  function buildStars() {
    var count = 900;
    var positions = new Float32Array(count * 3);
    for (var i = 0; i < count; i++) {
      var r = 5 + Math.random() * 8;
      var u = Math.random();
      var v = Math.random();
      var theta = 2 * Math.PI * u;
      var phi = Math.acos(2 * v - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    var mat = new THREE.PointsMaterial({
      color: 0xc8d6fa,
      size: 0.035,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    return new THREE.Points(geo, mat);
  }

  function initScene() {
    if (ready || !canvas) return;

    scene = new THREE.Scene();
    scene.background = null;

    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0.25, 2.45);

    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.42;

    earthGroup = new THREE.Group();
    scene.add(earthGroup);

    var atmGeo = new THREE.SphereGeometry(1.07, 48, 48);
    var atmMat = new THREE.MeshBasicMaterial({
      color: 0x9db6f2,
      transparent: true,
      opacity: 0.1,
      side: THREE.BackSide,
      depthWrite: false,
    });
    earthGroup.add(new THREE.Mesh(atmGeo, atmMat));

    var sphereGeo = new THREE.SphereGeometry(1, 64, 64);
    var placeholderTex = createPlaceholderEarthTexture();
    var sphereMat = new THREE.MeshStandardMaterial({
      map: placeholderTex || undefined,
      color: placeholderTex ? 0xffffff : 0x5c7ec4,
      metalness: 0.02,
      roughness: 0.82,
      emissive: 0x1e3a7a,
      emissiveIntensity: placeholderTex ? 0.12 : 0.28,
    });
    sphereMat.userData = { isPlaceholder: !!placeholderTex };
    var earthMesh = new THREE.Mesh(sphereGeo, sphereMat);
    earthGroup.add(earthMesh);

    var texLoader = new THREE.TextureLoader();
    if (typeof texLoader.setCrossOrigin === "function") {
      texLoader.setCrossOrigin("anonymous");
    }
    var loadGen = earthTexLoadGen;
    tryLoadEarthTexture(
      getEarthTextureUrls(),
      0,
      texLoader,
      sphereMat,
      renderer,
      null,
      function () {
        return loadGen === earthTexLoadGen && !!scene && !!sphereMat;
      }
    );

    markersGroup = new THREE.Group();
    earthGroup.add(markersGroup);

    scene.add(buildStars());

    var amb = new THREE.AmbientLight(0xeef2fc, 0.58);
    scene.add(amb);
    var key = new THREE.DirectionalLight(0xffffff, 1.38);
    key.position.set(4, 2.5, 5);
    scene.add(key);
    var fill = new THREE.PointLight(0xa8c0fa, 0.82, 16, 1.8);
    fill.position.set(-3.5, -1.2, 2);
    scene.add(fill);
    var rim = new THREE.DirectionalLight(0xc8d6fa, 0.55);
    rim.position.set(-4, -1, -3);
    scene.add(rim);
    var bounce = new THREE.DirectionalLight(0xf0f4fd, 0.42);
    bounce.position.set(0, 5, 1);
    scene.add(bounce);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 1.65;
    controls.maxDistance = 4.2;
    controls.enablePan = false;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.55;

    var reduced =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      controls.enableDamping = false;
    }

    canvas.addEventListener("pointerdown", onPointerStart);
    canvas.addEventListener("pointerup", onPointerEnd);

    resizeObserver = new ResizeObserver(function () {
      if (getRouteFromHash() === "travel") resizeRenderer();
    });
    var shell = canvas.closest(".travel-globe-shell");
    if (shell) resizeObserver.observe(shell);

    ready = true;
    rebuildMarkers(loadTrips());
    resizeRenderer();
    requestAnimationFrame(function () {
      resizeRenderer();
      requestAnimationFrame(resizeRenderer);
    });
    startLoop();
  }

  function disposeScene() {
    earthTexLoadGen++;
    stopLoop();
    if (canvas) {
      canvas.removeEventListener("pointerdown", onPointerStart);
      canvas.removeEventListener("pointerup", onPointerEnd);
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    clearMarkers3D();
    if (scene) {
      scene.traverse(function (obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(function (m) { m.dispose(); });
          else obj.material.dispose();
        }
      });
    }
    if (controls) {
      controls.dispose();
      controls = null;
    }
    if (renderer) {
      renderer.dispose();
      renderer = null;
    }
    scene = null;
    camera = null;
    earthGroup = null;
    markersGroup = null;
    ready = false;
  }

  function resizeRenderer() {
    if (!renderer || !camera || !canvas) return;
    var shell = canvas.closest(".travel-globe-shell");
    var w = shell ? shell.clientWidth : canvas.clientWidth;
    var h = shell ? shell.clientHeight : canvas.clientHeight;
    if (w < 2 || h < 2) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function startLoop() {
    stopLoop();
    function tick() {
      animationId = requestAnimationFrame(tick);
      if (controls) controls.update();
      if (renderer && scene && camera) renderer.render(scene, camera);
    }
    tick();
  }

  function stopLoop() {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  function onPointerStart(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointerStart = { x: e.clientX, y: e.clientY, id: e.pointerId };
  }

  function onPointerEnd(e) {
    /* 触摸屏上 button 常为 -1，不能按左键判断 */
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!pointerStart || e.pointerId !== pointerStart.id) {
      pointerStart = null;
      return;
    }
    var dx = e.clientX - pointerStart.x;
    var dy = e.clientY - pointerStart.y;
    pointerStart = null;
    /* 明显拖拽（旋转地球）时不拾取；轻微手抖仍算点击 */
    if (dx * dx + dy * dy > 400) return;
    pickMarker(e.clientX, e.clientY);
  }

  function pickMarker(clientX, clientY) {
    if (!camera || !markersGroup) return;
    var now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - lastPickAt < 90) return;
    lastPickAt = now;
    if (scene) scene.updateMatrixWorld(true);
    var shell = canvas.getBoundingClientRect();
    var x = ((clientX - shell.left) / shell.width) * 2 - 1;
    var y = -((clientY - shell.top) / shell.height) * 2 + 1;
    var raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

    var hits = raycaster.intersectObjects(markersGroup.children, true);
    if (!hits.length) return;
    var obj = hits[0].object;
    var group = obj;
    while (group && !group.userData.tripId) {
      group = group.parent;
    }
    if (group && group.userData.tripId) {
      selectTrip(group.userData.tripId);
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function parseISOLocal(iso) {
    if (!iso || typeof iso !== "string") return null;
    var p = iso.split("-");
    if (p.length !== 3) return null;
    var y = parseInt(p[0], 10);
    var m = parseInt(p[1], 10) - 1;
    var d = parseInt(p[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    return new Date(y, m, d);
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function isoFromDate(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  /** 中文日期，月日不补零，如 2026年4月12日 */
  function formatDateCN(iso) {
    var d = parseISOLocal(iso);
    if (!d || isNaN(d.getTime())) return escapeHtml(String(iso || ""));
    return (
      d.getFullYear() +
      "年" +
      (d.getMonth() + 1) +
      "月" +
      d.getDate() +
      "日"
    );
  }

  function renderTravelDetail(trip) {
    if (!detailEmptyEl || !detailContentEl) return;
    if (!trip) {
      detailEmptyEl.hidden = false;
      detailContentEl.hidden = true;
      detailContentEl.innerHTML = "";
      return;
    }
    detailEmptyEl.hidden = true;
    detailContentEl.hidden = false;

    var photos = getTripPhotos(trip);
    var photoSection;
    if (photos.length) {
      var multi = photos.length > 1;
      photoSection =
        '<figure class="travel-detail-photo' +
        (multi ? " has-carousel" : "") +
        '">' +
        '<div class="travel-detail-photo-stage">' +
        '<div class="travel-detail-photo-frame">' +
        '<img class="travel-detail-photo-img" src="' +
        photos[0] +
        '" alt="" loading="lazy" />' +
        "</div>" +
        (multi
          ? '<button type="button" class="travel-photo-nav travel-photo-prev" aria-label="上一张">‹</button>' +
            '<button type="button" class="travel-photo-nav travel-photo-next" aria-label="下一张">›</button>'
          : "") +
        "</div>" +
        '<figcaption class="travel-detail-photo-cap">' +
        (multi
          ? '<span class="travel-photo-index">1 / ' + photos.length + "</span>"
          : "旅行照片") +
        "</figcaption></figure>";
    } else {
      photoSection =
        '<div class="travel-detail-block travel-detail-block-muted"><p class="travel-detail-muted">未添加照片</p></div>';
    }

    var notesSection = trip.notes
      ? '<section class="travel-detail-block travel-detail-notes">' +
        '<h4 class="travel-detail-block-title">随笔</h4>' +
        '<div class="travel-detail-notes-body">' +
        escapeHtml(trip.notes).replace(/\n/g, "<br />") +
        "</div></section>"
      : '<div class="travel-detail-block travel-detail-block-muted"><p class="travel-detail-muted">未填写随笔</p></div>';

    detailContentEl.innerHTML =
      '<article class="travel-detail-card">' +
      '<header class="travel-detail-card-header">' +
      '<span class="travel-detail-pill">足迹</span>' +
      '<h3 class="travel-detail-card-title">' +
      escapeHtml(trip.place) +
      "</h3></header>" +
      '<div class="travel-detail-card-body">' +
      '<div class="travel-detail-kv">' +
      '<div class="travel-detail-kv-row">' +
      '<span class="travel-detail-k">日期</span>' +
      '<span class="travel-detail-v">' +
      formatDateCN(trip.date) +
      "</span></div>" +
      '<div class="travel-detail-kv-row">' +
      '<span class="travel-detail-k">坐标</span>' +
      '<span class="travel-detail-v travel-detail-coords">' +
      escapeHtml(formatLatLonLine(trip.lat, trip.lon)) +
      "</span></div></div>" +
      photoSection +
      notesSection +
      '<div class="travel-detail-actions">' +
      '<button type="button" class="travel-btn travel-btn-primary travel-detail-edit">编辑</button>' +
      '<button type="button" class="travel-btn travel-btn-ghost travel-detail-delete">删除</button>' +
      "</div></div></article>";

    var editBtn = detailContentEl.querySelector(".travel-detail-edit");
    var delBtn = detailContentEl.querySelector(".travel-detail-delete");
    if (editBtn) {
      editBtn.addEventListener("click", function () {
        startEditTrip(trip.id);
      });
    }
    if (delBtn) {
      delBtn.addEventListener("click", function (e) {
        deleteTrip(trip.id, e);
      });
    }

    if (photos.length > 1) {
      var photoIdx = 0;
      var imgEl = detailContentEl.querySelector(".travel-detail-photo-img");
      var indexEl = detailContentEl.querySelector(".travel-photo-index");
      var prevBtn = detailContentEl.querySelector(".travel-photo-prev");
      var nextBtn = detailContentEl.querySelector(".travel-photo-next");

      function showPhoto(nextIdx) {
        photoIdx = (nextIdx + photos.length) % photos.length;
        if (imgEl) imgEl.src = photos[photoIdx];
        if (indexEl) indexEl.textContent = photoIdx + 1 + " / " + photos.length;
      }

      if (prevBtn) {
        prevBtn.addEventListener("click", function (e) {
          e.preventDefault();
          showPhoto(photoIdx - 1);
        });
      }
      if (nextBtn) {
        nextBtn.addEventListener("click", function (e) {
          e.preventDefault();
          showPhoto(photoIdx + 1);
        });
      }
    }
  }

  function formatLatLonLine(lat, lon) {
    var la = Number(lat);
    var lo = Number(lon);
    var ns = la >= 0 ? "北纬" : "南纬";
    var ew = lo >= 0 ? "东经" : "西经";
    return (
      ns +
      " " +
      Math.abs(la).toFixed(4) +
      " · " +
      ew +
      " " +
      Math.abs(lo).toFixed(4)
    );
  }

  var travelDateUI = {
    reset: function () {},
    setValue: function () {},
  };

  function initTravelDatePicker() {
    var trigger = document.getElementById("travel-date-trigger");
    var hidden = document.getElementById("travel-date");
    var pop = document.getElementById("travel-datepicker");
    var textEl = document.getElementById("travel-date-trigger-text");
    var wrap = document.querySelector(".travel-date-wrap");
    if (!trigger || !hidden || !pop || !textEl || !wrap) return;

    var viewYear = new Date().getFullYear();
    var viewMonth = new Date().getMonth();
    var open = false;

    var WEEK_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

    function calendarYearBounds() {
      var cy = new Date().getFullYear();
      return { min: cy - 120, max: cy + 8 };
    }

    function buildYearOptions(selectedY) {
      var b = calendarYearBounds();
      var s = "";
      var yy;
      for (yy = b.min; yy <= b.max; yy++) {
        s +=
          '<option value="' +
          yy +
          '"' +
          (yy === selectedY ? " selected" : "") +
          ">" +
          yy +
          "</option>";
      }
      return s;
    }

    function buildMonthOptions(selectedM0) {
      var s = "";
      var mm;
      for (mm = 0; mm < 12; mm++) {
        s +=
          '<option value="' +
          (mm + 1) +
          '"' +
          (mm === selectedM0 ? " selected" : "") +
          ">" +
          (mm + 1) +
          "月</option>";
      }
      return s;
    }

    function syncTrigger() {
      if (!hidden.value) {
        textEl.textContent = "选择日期";
        return;
      }
      var d = parseISOLocal(hidden.value);
      textEl.textContent = d && !isNaN(d.getTime()) ? formatDateCN(hidden.value) : "选择日期";
    }

    function closePop() {
      open = false;
      pop.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    }

    function openPop() {
      open = true;
      pop.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      if (hidden.value) {
        var sd = parseISOLocal(hidden.value);
        if (sd) {
          viewYear = sd.getFullYear();
          viewMonth = sd.getMonth();
        }
      }
      renderMonth();
    }

    function renderMonth() {
      var y = viewYear;
      var m = viewMonth;
      var first = new Date(y, m, 1);
      var pad = first.getDay();
      var dim = new Date(y, m + 1, 0).getDate();
      var today = new Date();
      var todayY = today.getFullYear();
      var todayM = today.getMonth();
      var todayD = today.getDate();

      var sel = hidden.value ? parseISOLocal(hidden.value) : null;

      var head =
        '<div class="travel-dp-select-row">' +
        '<label class="travel-dp-select-label">' +
        '<span class="travel-dp-select-hint">年</span>' +
        '<select class="travel-dp-year" id="travel-dp-year" aria-label="选择年份">' +
        buildYearOptions(y) +
        "</select></label>" +
        '<label class="travel-dp-select-label">' +
        '<span class="travel-dp-select-hint">月</span>' +
        '<select class="travel-dp-month" id="travel-dp-month" aria-label="选择月份">' +
        buildMonthOptions(m) +
        "</select></label>" +
        '<div class="travel-dp-nav-btns">' +
        '<button type="button" class="travel-dp-nav" data-act="prev" aria-label="上个月">‹</button>' +
        '<button type="button" class="travel-dp-nav" data-act="next" aria-label="下个月">›</button>' +
        "</div></div>";

      var wk =
        '<div class="travel-dp-weekdays">' +
        WEEK_LABELS.map(function (w) {
          return '<span class="travel-dp-wd">' + w + "</span>";
        }).join("") +
        "</div>";

      var cells = [];
      var i;
      for (i = 0; i < pad; i++) {
        cells.push('<span class="travel-dp-cell travel-dp-pad"></span>');
      }
      for (i = 1; i <= dim; i++) {
        var isToday = y === todayY && m === todayM && i === todayD;
        var isSel =
          sel &&
          sel.getFullYear() === y &&
          sel.getMonth() === m &&
          sel.getDate() === i;
        var cls = "travel-dp-cell travel-dp-day";
        if (isToday) cls += " is-today";
        if (isSel) cls += " is-selected";
        cells.push(
          '<button type="button" class="' +
            cls +
            '" data-day="' +
            i +
            '">' +
            i +
            "</button>"
        );
      }
      while (cells.length % 7 !== 0) {
        cells.push('<span class="travel-dp-cell travel-dp-pad"></span>');
      }

      pop.innerHTML =
        head +
        wk +
        '<div class="travel-dp-grid">' +
        cells.join("") +
        "</div>" +
        '<div class="travel-dp-foot">' +
        '<button type="button" class="travel-dp-today" data-act="today">今天</button>' +
        "</div>";

      var ySel = pop.querySelector("#travel-dp-year");
      var mSel = pop.querySelector("#travel-dp-month");
      if (ySel) {
        ySel.addEventListener("change", function (ev) {
          ev.stopPropagation();
          viewYear = parseInt(ySel.value, 10);
          if (isNaN(viewYear)) return;
          renderMonth();
        });
      }
      if (mSel) {
        mSel.addEventListener("change", function (ev) {
          ev.stopPropagation();
          var mv = parseInt(mSel.value, 10) - 1;
          if (isNaN(mv) || mv < 0 || mv > 11) return;
          viewMonth = mv;
          renderMonth();
        });
      }

      pop.querySelectorAll("[data-act=prev]")[0].addEventListener("click", function (ev) {
        ev.stopPropagation();
        viewMonth--;
        if (viewMonth < 0) {
          viewMonth = 11;
          viewYear--;
        }
        renderMonth();
      });
      pop.querySelectorAll("[data-act=next]")[0].addEventListener("click", function (ev) {
        ev.stopPropagation();
        viewMonth++;
        if (viewMonth > 11) {
          viewMonth = 0;
          viewYear++;
        }
        renderMonth();
      });
      pop.querySelectorAll("[data-act=today]")[0].addEventListener("click", function (ev) {
        ev.stopPropagation();
        var t = new Date();
        hidden.value = isoFromDate(t);
        syncTrigger();
        closePop();
      });

      pop.querySelectorAll(".travel-dp-day").forEach(function (btn) {
        btn.addEventListener("click", function (ev) {
          ev.stopPropagation();
          var day = parseInt(btn.getAttribute("data-day"), 10);
          var dt = new Date(y, m, day);
          hidden.value = isoFromDate(dt);
          syncTrigger();
          closePop();
        });
      });
    }

    trigger.addEventListener("click", function (e) {
      e.stopPropagation();
      if (open) {
        closePop();
      } else {
        openPop();
      }
    });

    document.addEventListener("mousedown", function (e) {
      if (!open) return;
      if (wrap.contains(e.target)) return;
      closePop();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && open) {
        closePop();
      }
    });

    travelDateUI.reset = function () {
      hidden.value = "";
      syncTrigger();
      closePop();
      var n = new Date();
      viewYear = n.getFullYear();
      viewMonth = n.getMonth();
    };

    travelDateUI.setValue = function (iso) {
      hidden.value = iso || "";
      if (iso) {
        var sd = parseISOLocal(iso);
        if (sd && !isNaN(sd.getTime())) {
          viewYear = sd.getFullYear();
          viewMonth = sd.getMonth();
        }
      }
      syncTrigger();
      closePop();
    };

    if (form) {
      form.addEventListener("reset", function () {
        window.setTimeout(function () {
          travelDateUI.reset();
        }, 0);
      });
    }

    syncTrigger();
  }

  function setFormMode(isEditing) {
    var submitBtn = document.getElementById("travel-submit");
    if (formTitleEl) formTitleEl.textContent = isEditing ? "编辑足迹" : "录入足迹";
    if (submitBtn) submitBtn.textContent = isEditing ? "保存修改" : "添加到地球";
    if (cancelEditBtn) cancelEditBtn.hidden = !isEditing;
    if (photoHintEl) photoHintEl.hidden = !isEditing;
    if (photoHintDefaultEl) photoHintDefaultEl.hidden = !!isEditing;
    if (form) {
      if (isEditing) form.classList.add("is-editing");
      else form.classList.remove("is-editing");
    }
  }

  function clearEditMode(resetFields) {
    editingId = null;
    editingOriginalPlace = "";
    setFormMode(false);
    if (resetFields && form) {
      form.reset();
      var photoEl = document.getElementById("travel-photo");
      if (photoEl) photoEl.value = "";
      travelDateUI.reset();
    }
  }

  function startEditTrip(id) {
    var trips = loadTrips();
    var trip = trips.filter(function (t) { return t.id === id; })[0] || null;
    if (!trip || !form) return;

    selectedId = id;
    editingId = id;
    editingOriginalPlace = trip.place || "";

    var placeEl = document.getElementById("travel-place");
    var notesEl = document.getElementById("travel-notes");
    var photoEl = document.getElementById("travel-photo");

    if (placeEl) placeEl.value = trip.place || "";
    if (notesEl) notesEl.value = trip.notes || "";
    if (photoEl) photoEl.value = "";
    travelDateUI.setValue(trip.date || "");

    setFormMode(true);
    renderTravelDetail(trip);
    renderTripList();

    form.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (placeEl) placeEl.focus();
  }

  function selectTrip(id) {
    selectedId = id;
    var trips = loadTrips();
    var trip = trips.filter(function (t) { return t.id === id; })[0] || null;
    renderTravelDetail(trip);
    renderTripList();
  }

  function deleteTrip(id, ev) {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    var trips = loadTrips();
    var trip = trips.filter(function (t) { return t.id === id; })[0] || null;
    var label = trip && trip.place ? trip.place : "这条足迹";
    if (!window.confirm("确定删除「" + label + "」吗？此操作不可撤销。")) {
      return;
    }
    trips = trips.filter(function (t) { return t.id !== id; });
    saveTrips(trips);
    if (selectedId === id) {
      selectedId = null;
      renderTravelDetail(null);
    }
    if (editingId === id) {
      clearEditMode(true);
    }
    rebuildMarkers(trips);
    renderTripList();
  }

  function renderTripList() {
    if (!tripList || !listEmpty) return;
    var trips = loadTrips();
    listEmpty.style.display = trips.length ? "none" : "";
    tripList.innerHTML = "";
    trips
      .slice()
      .sort(function (a, b) {
        return String(b.date).localeCompare(String(a.date)) || String(b.place).localeCompare(String(a.place));
      })
      .forEach(function (t) {
        var li = document.createElement("li");
        li.className = "travel-trip-item" + (selectedId === t.id ? " is-selected" : "");
        li.innerHTML =
          '<button type="button" class="travel-trip-select">' +
          escapeHtml(t.place) +
          '<span class="travel-trip-date">' +
          escapeHtml(formatDateCN(t.date)) +
          "</span></button>" +
          '<div class="travel-trip-actions">' +
          '<button type="button" class="travel-trip-edit" aria-label="编辑「' +
          escapeHtml(t.place) +
          '」">编辑</button>' +
          '<button type="button" class="travel-trip-delete" aria-label="删除「' +
          escapeHtml(t.place) +
          '」">删除</button></div>';
        var sel = li.querySelector(".travel-trip-select");
        var edit = li.querySelector(".travel-trip-edit");
        var del = li.querySelector(".travel-trip-delete");
        sel.addEventListener("click", function () {
          selectTrip(t.id);
        });
        edit.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          startEditTrip(t.id);
        });
        del.addEventListener("click", function (e) {
          deleteTrip(t.id, e);
        });
        tripList.appendChild(li);
      });
  }

  function onTravelEnter() {
    renderTravelDetail(
      selectedId
        ? loadTrips().filter(function (t) { return t.id === selectedId; })[0] || null
        : null
    );
    initScene();
    renderTripList();
  }

  function onTravelLeave() {
    disposeScene();
    selectedId = null;
    clearEditMode(true);
    renderTravelDetail(null);
  }

  function applyRoute() {
    var route = getRouteFromHash();
    if (route === "travel") onTravelEnter();
    else onTravelLeave();
  }

  if (cancelEditBtn) {
    cancelEditBtn.addEventListener("click", function () {
      clearEditMode(true);
    });
  }

  if (form) {
    form.addEventListener("reset", function () {
      window.setTimeout(function () {
        if (editingId) clearEditMode(false);
        else setFormMode(false);
      }, 0);
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var placeEl = document.getElementById("travel-place");
      var dateEl = document.getElementById("travel-date");
      var notesEl = document.getElementById("travel-notes");
      var photoEl = document.getElementById("travel-photo");
      var submitBtn = document.getElementById("travel-submit");

      var query = (placeEl && placeEl.value.trim()) || "";
      var date = (dateEl && dateEl.value) || "";
      var notes = notesEl ? notesEl.value.trim() : "";
      var isEditing = !!editingId;
      var currentEditId = editingId;

      if (!query || !date) {
        alert("请填写地点名称与旅行日期。");
        return;
      }

      var files =
        photoEl && photoEl.files && photoEl.files.length
          ? Array.prototype.slice.call(photoEl.files, 0)
          : [];
      if (files.length > MAX_TRIP_PHOTOS) {
        alert("一次最多上传 " + MAX_TRIP_PHOTOS + " 张照片，已自动截取前 " + MAX_TRIP_PHOTOS + " 张。");
        files = files.slice(0, MAX_TRIP_PHOTOS);
      }
      var existingTrip = null;
      if (isEditing) {
        existingTrip =
          loadTrips().filter(function (t) {
            return t.id === currentEditId;
          })[0] || null;
        if (!existingTrip) {
          alert("要编辑的足迹已不存在，请刷新后重试。");
          clearEditMode(true);
          return;
        }
      }

      function restoreSubmitLabel() {
        if (!submitBtn) return;
        submitBtn.disabled = false;
        submitBtn.textContent = isEditing ? "保存修改" : "添加到地球";
      }

      function finishTrip(placeLabel, lat, lon, photos) {
        var trips = loadTrips();
        var trip;
        var photoList = Array.isArray(photos) ? photos.filter(Boolean) : [];
        if (isEditing && existingTrip) {
          var idx = -1;
          var i;
          for (i = 0; i < trips.length; i++) {
            if (trips[i].id === currentEditId) {
              idx = i;
              break;
            }
          }
          if (idx < 0) {
            alert("要编辑的足迹已不存在，请刷新后重试。");
            clearEditMode(true);
            return;
          }
          if (!photoList.length) {
            photoList = getTripPhotos(existingTrip);
          }
          trip = {
            id: existingTrip.id,
            place: placeLabel,
            date: date,
            lat: lat,
            lon: lon,
            notes: notes || "",
            photos: photoList,
            photoDataUrl: photoList[0] || "",
          };
          trips[idx] = trip;
        } else {
          trip = {
            id:
              typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : "t-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9),
            place: placeLabel,
            date: date,
            lat: lat,
            lon: lon,
            notes: notes || "",
            photos: photoList,
            photoDataUrl: photoList[0] || "",
          };
          trips.push(trip);
        }
        saveTrips(trips);
        rebuildMarkers(trips);
        clearEditMode(true);
        selectTrip(trip.id);
      }

      function applyResolved(placeLabel, lat, lon) {
        if (files.length) {
          compressImageFiles(files, 1280, 0.82, function (dataUrls) {
            restoreSubmitLabel();
            finishTrip(placeLabel, lat, lon, dataUrls);
          });
        } else {
          restoreSubmitLabel();
          finishTrip(placeLabel, lat, lon, null);
        }
      }

      function afterGeocode(geo) {
        if (!geo) {
          restoreSubmitLabel();
          alert(
            "未找到与「" + query + "」匹配的位置，请尝试更具体的名称（例如城市名、区名或带上国家）。"
          );
          return;
        }
        applyResolved(geo.label, geo.lat, geo.lon);
      }

      var placeUnchanged =
        isEditing &&
        existingTrip &&
        query === editingOriginalPlace &&
        typeof existingTrip.lat === "number" &&
        typeof existingTrip.lon === "number";

      if (placeUnchanged) {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = files.length ? "正在处理照片…" : "正在保存…";
        }
        applyResolved(existingTrip.place, existingTrip.lat, existingTrip.lon);
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "正在解析地点…";
      }
      geocodePlace(query)
        .then(afterGeocode)
        .catch(function () {
          restoreSubmitLabel();
          alert("无法连接地理编码服务，请检查网络后重试。");
        });
    });
  }

  window.addEventListener("hashchange", applyRoute);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      initTravelDatePicker();
      applyRoute();
    });
  } else {
    initTravelDatePicker();
    applyRoute();
  }
})();
