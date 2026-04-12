/**
 * Travel map: Three.js globe, localStorage trips, sidebar detail.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

(function () {
  "use strict";

  var STORAGE_KEY = "katana-travel-trips";
  /* 日间贴图（r160 仓库无 daymap，使用官方 dev 分支的地球昼面纹理，陆地与海洋更清晰） */
  var EARTH_TEX =
    "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_day_4096.jpg";

  var ROUTES = ["home", "travel", "movies", "books", "french"];

  var sidebarTitle = document.getElementById("sidebar-title");
  var sidebarBody = document.getElementById("sidebar-body");
  var defaultSidebarHTML = sidebarBody ? sidebarBody.innerHTML : "";
  var defaultSidebarTitle = sidebarTitle ? sidebarTitle.textContent : "";

  var canvas = document.getElementById("travel-globe-canvas");
  var globeHint = document.getElementById("travel-globe-hint");
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
  var pointerStart = null;
  var lastPickAt = 0;

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
      var x = r * Math.sin(phi) * Math.cos(theta);
      var y = r * Math.sin(phi) * Math.sin(theta);
      var z = r * Math.cos(phi);
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
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
    var sphereMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.04,
      roughness: 0.78,
      emissive: 0x1e3a7a,
      emissiveIntensity: 0.22,
    });
    var earthMesh = new THREE.Mesh(sphereGeo, sphereMat);
    earthGroup.add(earthMesh);

    var loader = new THREE.TextureLoader();
    loader.load(
      EARTH_TEX,
      function (tex) {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        sphereMat.map = tex;
        sphereMat.needsUpdate = true;
      },
      undefined,
      function () {
        if (globeHint) globeHint.textContent = "贴图加载失败，已使用纯色地球；可刷新重试。";
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

  function formatDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return escapeHtml(iso);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "年" + m + "月" + day + "日";
  }

  function renderSidebarTrip(trip) {
    if (!sidebarBody || !sidebarTitle) return;
    sidebarTitle.textContent = "足迹详情";
    if (!trip) {
      sidebarBody.innerHTML =
        '<div class="travel-sidebar-card">' +
        '<p class="travel-sidebar-lead">点击地球上的柔光标记，或从下方列表选择一条足迹，即可在此查看日期、照片与随笔。</p>' +
        "</div>";
      return;
    }
    var imgBlock = trip.photoDataUrl
      ? '<div class="travel-sidebar-photo"><img src="' +
        trip.photoDataUrl +
        '" alt="" loading="lazy" /></div>'
      : "";
    var notesBlock = trip.notes
      ? '<div class="travel-sidebar-notes"><p class="travel-notes-label">随笔</p><p class="travel-notes-body">' +
        escapeHtml(trip.notes).replace(/\n/g, "<br />") +
        "</p></div>"
      : '<p class="travel-sidebar-muted">未填写随笔</p>';

    sidebarBody.innerHTML =
      '<div class="travel-sidebar-card">' +
      '<h3 class="travel-sidebar-place">' +
      escapeHtml(trip.place) +
      "</h3>" +
      '<p class="travel-sidebar-meta">' +
      formatDate(trip.date) +
      "</p>" +
      '<p class="travel-sidebar-coords">纬度 ' +
      trip.lat +
      " · 经度 " +
      trip.lon +
      "</p>" +
      imgBlock +
      notesBlock +
      "</div>";
  }

  function restoreSidebarDefault() {
    if (sidebarBody) sidebarBody.innerHTML = defaultSidebarHTML;
    if (sidebarTitle) sidebarTitle.textContent = defaultSidebarTitle;
  }

  function selectTrip(id) {
    selectedId = id;
    var trips = loadTrips();
    var trip = trips.filter(function (t) { return t.id === id; })[0] || null;
    renderSidebarTrip(trip);
    renderTripList();
  }

  function deleteTrip(id, ev) {
    if (ev) ev.preventDefault();
    var trips = loadTrips().filter(function (t) { return t.id !== id; });
    saveTrips(trips);
    if (selectedId === id) {
      selectedId = null;
      renderSidebarTrip(null);
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
          escapeHtml(t.date) +
          "</span></button>" +
          '<button type="button" class="travel-trip-delete" aria-label="删除「' +
          escapeHtml(t.place) +
          '」">删除</button>';
        var sel = li.querySelector(".travel-trip-select");
        var del = li.querySelector(".travel-trip-delete");
        sel.addEventListener("click", function () {
          selectTrip(t.id);
        });
        del.addEventListener("click", function (e) {
          deleteTrip(t.id, e);
        });
        tripList.appendChild(li);
      });
  }

  function onTravelEnter() {
    if (sidebarTitle) sidebarTitle.textContent = "足迹详情";
    renderSidebarTrip(
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
    restoreSidebarDefault();
  }

  function applyRoute() {
    var route = getRouteFromHash();
    if (route === "travel") onTravelEnter();
    else onTravelLeave();
  }

  if (form) {
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

      if (!query || !date) {
        alert("请填写地点名称与旅行日期。");
        return;
      }

      var file = photoEl && photoEl.files && photoEl.files[0] ? photoEl.files[0] : null;

      function finishTrip(placeLabel, lat, lon, photoDataUrl) {
        var trip = {
          id:
            typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : "t-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9),
          place: placeLabel,
          date: date,
          lat: lat,
          lon: lon,
          notes: notes || "",
          photoDataUrl: photoDataUrl || "",
        };
        var trips = loadTrips();
        trips.push(trip);
        saveTrips(trips);
        rebuildMarkers(trips);
        selectTrip(trip.id);
        form.reset();
        if (photoEl) photoEl.value = "";
      }

      function afterGeocode(geo) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "添加到地球";
        }
        if (!geo) {
          alert(
            "未找到与「" + query + "」匹配的位置，请尝试更具体的名称（例如城市名、区名或带上国家）。"
          );
          return;
        }
        if (file) {
          compressImageFile(file, 1280, 0.82, function (dataUrl) {
            finishTrip(geo.label, geo.lat, geo.lon, dataUrl);
          });
        } else {
          finishTrip(geo.label, geo.lat, geo.lon, null);
        }
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "正在解析地点…";
      }
      geocodePlace(query)
        .then(afterGeocode)
        .catch(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "添加到地球";
          }
          alert("无法连接地理编码服务，请检查网络后重试。");
        });
    });
  }

  window.addEventListener("hashchange", applyRoute);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyRoute);
  } else {
    applyRoute();
  }
})();
