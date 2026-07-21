/**
 * GitHub-backed travel data: public read from static JSON/photos,
 * owner write via GitHub Contents API + Personal Access Token.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.TravelCloud = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  "use strict";

  var TOKEN_KEY = "katana-travel-gh-token";
  var TRIPS_PATH = "data/travel-trips.json";
  var PHOTOS_DIR = "assets/travel";

  var cachedBranch = null;

  function detectRepo() {
    var host = (typeof location !== "undefined" && location.hostname) || "";
    var m = host.match(/^([^.]+)\.github\.io$/i);
    if (m) {
      return {
        owner: m[1],
        repo: m[1] + ".github.io",
      };
    }
    return {
      owner: "KatanaZorimech",
      repo: "KatanaZorimech.github.io",
    };
  }

  function getToken() {
    try {
      return (localStorage.getItem(TOKEN_KEY) || "").trim();
    } catch (e) {
      return "";
    }
  }

  function setToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token.trim());
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  function clearToken() {
    setToken("");
    cachedBranch = null;
  }

  function utf8ToBase64(str) {
    if (typeof TextEncoder !== "undefined") {
      var bytes = new TextEncoder().encode(str);
      var bin = "";
      var i;
      for (i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    }
    return btoa(unescape(encodeURIComponent(str)));
  }

  function dataUrlToRawBase64(dataUrl) {
    if (!dataUrl || dataUrl.indexOf("data:") !== 0) return null;
    var comma = dataUrl.indexOf(",");
    if (comma < 0) return null;
    return dataUrl.slice(comma + 1).replace(/\s/g, "");
  }

  function isDataUrl(s) {
    return typeof s === "string" && s.indexOf("data:") === 0;
  }

  function apiHeaders(token, extra) {
    var h = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (token) h.Authorization = "Bearer " + token;
    if (extra) {
      var k;
      for (k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) h[k] = extra[k];
      }
    }
    return h;
  }

  function repoApi(path) {
    var r = detectRepo();
    return "https://api.github.com/repos/" + r.owner + "/" + r.repo + path;
  }

  function resolveBranch(token) {
    if (cachedBranch) return Promise.resolve(cachedBranch);
    return fetch(repoApi(""), {
      headers: apiHeaders(token || undefined),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("无法读取仓库信息（HTTP " + res.status + "）");
        return res.json();
      })
      .then(function (data) {
        cachedBranch = data.default_branch || "main";
        return cachedBranch;
      });
  }

  function getContentsMeta(path, token) {
    return resolveBranch(token).then(function (branch) {
      var url =
        repoApi("/contents/" + path.split("/").map(encodeURIComponent).join("/")) +
        "?ref=" +
        encodeURIComponent(branch);
      return fetch(url, { headers: apiHeaders(token) }).then(function (res) {
        if (res.status === 404) return null;
        if (!res.ok) {
          return res.json().then(
            function (err) {
              throw new Error(
                (err && err.message) || "读取文件失败（HTTP " + res.status + "）"
              );
            },
            function () {
              throw new Error("读取文件失败（HTTP " + res.status + "）");
            }
          );
        }
        return res.json();
      });
    });
  }

  function putContents(path, base64Content, message, token, sha) {
    return resolveBranch(token).then(function (branch) {
      var body = {
        message: message,
        content: base64Content,
        branch: branch,
      };
      if (sha) body.sha = sha;
      var url = repoApi(
        "/contents/" + path.split("/").map(encodeURIComponent).join("/")
      );
      return fetch(url, {
        method: "PUT",
        headers: apiHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      }).then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) {
            throw new Error(
              (data && data.message) || "写入 GitHub 失败（HTTP " + res.status + "）"
            );
          }
          return data;
        });
      });
    });
  }

  function deleteContents(path, message, token, sha) {
    return resolveBranch(token).then(function (branch) {
      var url = repoApi(
        "/contents/" + path.split("/").map(encodeURIComponent).join("/")
      );
      return fetch(url, {
        method: "DELETE",
        headers: apiHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          message: message,
          sha: sha,
          branch: branch,
        }),
      }).then(function (res) {
        if (res.status === 404) return null;
        return res.json().then(function (data) {
          if (!res.ok) {
            throw new Error(
              (data && data.message) || "删除文件失败（HTTP " + res.status + "）"
            );
          }
          return data;
        });
      });
    });
  }

  function parseTripsPayload(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.trips)) return data.trips;
    return [];
  }

  /** Public read: static file on the site (works for all visitors). */
  function fetchPublicTrips() {
    var url = TRIPS_PATH + "?t=" + Date.now();
    return fetch(url, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        return {
          ok: true,
          trips: parseTripsPayload(data),
          updatedAt: data && data.updatedAt ? data.updatedAt : null,
        };
      })
      .catch(function () {
        return { ok: false, trips: [], updatedAt: null };
      });
  }

  function normalizeTripPhotos(trip) {
    if (!trip) return [];
    if (Array.isArray(trip.photos) && trip.photos.length) {
      return trip.photos.filter(function (p) {
        return typeof p === "string" && p;
      });
    }
    if (trip.photoDataUrl) return [trip.photoDataUrl];
    return [];
  }

  function sanitizeTripsForCloud(trips) {
    return (trips || []).map(function (t) {
      var photos = normalizeTripPhotos(t).filter(function (p) {
        return !isDataUrl(p);
      });
      return {
        id: t.id,
        place: t.place || "",
        date: t.date || "",
        lat: t.lat,
        lon: t.lon,
        notes: t.notes || "",
        photos: photos,
      };
    });
  }

  function buildTripsJson(trips) {
    return JSON.stringify(
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        trips: sanitizeTripsForCloud(trips),
      },
      null,
      2
    );
  }

  function uploadDataUrlAsJpeg(dataUrl, filePath, message, token) {
    var b64 = dataUrlToRawBase64(dataUrl);
    if (!b64) return Promise.reject(new Error("无效的图片数据"));
    return getContentsMeta(filePath, token).then(function (meta) {
      return putContents(filePath, b64, message, token, meta && meta.sha);
    });
  }

  /**
   * Ensure all photos are repo paths (upload data URLs), then write JSON.
   * Returns trips with path-based photos.
   */
  function publishTrips(trips, options) {
    var token = getToken();
    if (!token) return Promise.reject(new Error("未配置 GitHub Token"));

    var opts = options || {};
    var message = opts.message || "chore(travel): update travel trips";
    var list = (trips || []).map(function (t) {
      return {
        id: t.id,
        place: t.place || "",
        date: t.date || "",
        lat: t.lat,
        lon: t.lon,
        notes: t.notes || "",
        photos: normalizeTripPhotos(t).slice(),
      };
    });

    function uploadTripPhotos(index) {
      if (index >= list.length) return Promise.resolve();
      var trip = list[index];
      var photos = trip.photos || [];
      var nextPhotos = [];
      var pi = 0;

      function nextPhoto() {
        if (pi >= photos.length) {
          trip.photos = nextPhotos;
          return uploadTripPhotos(index + 1);
        }
        var src = photos[pi];
        if (!isDataUrl(src)) {
          nextPhotos.push(src);
          pi++;
          return nextPhoto();
        }
        var path = PHOTOS_DIR + "/" + trip.id + "-" + pi + ".jpg";
        return uploadDataUrlAsJpeg(
          src,
          path,
          "chore(travel): photo " + trip.id + " #" + (pi + 1),
          token
        ).then(function () {
          nextPhotos.push(path);
          pi++;
          return nextPhoto();
        });
      }

      return nextPhoto();
    }

    return uploadTripPhotos(0).then(function () {
      var json = buildTripsJson(list);
      return getContentsMeta(TRIPS_PATH, token).then(function (meta) {
        return putContents(
          TRIPS_PATH,
          utf8ToBase64(json),
          message,
          token,
          meta && meta.sha
        ).then(function () {
          return list;
        });
      });
    });
  }

  /** Best-effort remove orphaned photo files that are no longer referenced. */
  function pruneRemovedPhotos(beforeTrips, afterTrips, token) {
    if (!token) return Promise.resolve();
    var keep = {};
    (afterTrips || []).forEach(function (t) {
      normalizeTripPhotos(t).forEach(function (p) {
        if (p && !isDataUrl(p)) keep[p] = true;
      });
    });
    var toDelete = [];
    (beforeTrips || []).forEach(function (t) {
      normalizeTripPhotos(t).forEach(function (p) {
        if (p && !isDataUrl(p) && !keep[p] && p.indexOf(PHOTOS_DIR + "/") === 0) {
          toDelete.push(p);
        }
      });
    });

    function delNext(i) {
      if (i >= toDelete.length) return Promise.resolve();
      var path = toDelete[i];
      return getContentsMeta(path, token)
        .then(function (meta) {
          if (!meta || !meta.sha) return null;
          return deleteContents(path, "chore(travel): remove unused photo", token, meta.sha);
        })
        .catch(function () {
          return null;
        })
        .then(function () {
          return delNext(i + 1);
        });
    }
    return delNext(0);
  }

  function verifyToken(token) {
    return fetch(repoApi(""), {
      headers: apiHeaders(token),
    }).then(function (res) {
      if (res.status === 401 || res.status === 403) {
        throw new Error("Token 无效或没有访问本仓库的权限");
      }
      if (!res.ok) throw new Error("验证失败（HTTP " + res.status + "）");
      return res.json().then(function (data) {
        cachedBranch = data.default_branch || "main";
        var perms = data.permissions || {};
        if (perms.push === false) {
          throw new Error("Token 无法写入本仓库，请授予 Contents: Read and write");
        }
        return {
          owner: data.owner && data.owner.login,
          defaultBranch: cachedBranch,
          fullName: data.full_name,
        };
      });
    });
  }

  return {
    TOKEN_KEY: TOKEN_KEY,
    TRIPS_PATH: TRIPS_PATH,
    PHOTOS_DIR: PHOTOS_DIR,
    detectRepo: detectRepo,
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,
    isDataUrl: isDataUrl,
    fetchPublicTrips: fetchPublicTrips,
    publishTrips: publishTrips,
    pruneRemovedPhotos: pruneRemovedPhotos,
    verifyToken: verifyToken,
    normalizeTripPhotos: normalizeTripPhotos,
  };
});
