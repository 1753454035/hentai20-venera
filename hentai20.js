// Hentai20 source for Venera / VeneraX
// Site pages are parsed locally; no site scripts are executed.
const H20_BASE = "https://hentai20.io";
const H20_HOME = H20_BASE + "/home1/";
const H20_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36",
  "Referer": H20_BASE + "/",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9"
};

function h20Abs(url) {
  if (!url) return "";
  url = String(url).trim().replace(/&amp;/g, "&");
  if (/^(https?:)?\/\//i.test(url)) return url.indexOf("//") === 0 ? "https:" + url : url;
  if (url.charAt(0) === "/") return H20_BASE + url;
  return H20_BASE + "/" + url;
}
function h20Attr(el, names) {
  if (!el || !el.attributes) return "";
  for (let i = 0; i < names.length; i++) {
    const v = el.attributes[names[i]];
    if (v) return String(v).trim();
  }
  return "";
}
function h20Text(el) {
  return el && el.text ? el.text.trim().replace(/\s+/g, " ") : "";
}
function h20MaxPage(html) {
  let max = 1;
  const re = /(?:\/page\/|[?&](?:paged|page)=)(\d+)/gi;
  let m;
  while ((m = re.exec(html)) !== null) max = Math.max(max, parseInt(m[1], 10) || 1);
  return max;
}
function h20PageUrl(url, page) {
  if (!page || page <= 1) return url;
  return url + (url.indexOf("?") >= 0 ? "&" : "?") + "paged=" + page;
}
function h20Fetch(url) {
  return Network.get(url, H20_HEADERS).then((r) => {
    if (r.status !== 200) throw "Hentai20 请求失败，HTTP " + r.status;
    if (!r.body || /Just a moment|cf-chl-|challenge-platform/i.test(r.body)) {
      throw "Hentai20 返回了验证页面。请先在浏览器中确认网站可正常访问，再稍后重试。";
    }
    return r.body;
  });
}
function h20ParseComics(html) {
  const doc = new HtmlDocument(html);
  const links = doc.querySelectorAll("a[href*='/manga/']");
  const result = [];
  const seen = {};
  links.forEach((a) => {
    const href = h20Attr(a, ["href"]);
    if (!href || /\/chapter[-/]/i.test(href)) return;
    const full = h20Abs(href);
    if (seen[full]) return;
    const img = a.querySelector("img");
    let cover = h20Attr(img, ["data-src", "data-lazy-src", "data-original", "src"]);
    if (!cover && img) {
      const srcset = h20Attr(img, ["data-srcset", "srcset"]);
      if (srcset) cover = srcset.split(",")[0].trim().split(/\s+/)[0];
    }
    const title = h20Attr(img, ["alt", "title"]) || h20Attr(a, ["title"]) || h20Text(a);
    if (!title) return;
    // Avoid matching navigation or empty anchors; list cards normally have a cover.
    if (!cover) return;
    seen[full] = true;
    result.push(new Comic({
      id: full,
      title: title,
      cover: h20Abs(cover),
      subtitle: "",
      description: h20Text(a),
      tags: [],
      language: "en"
    }));
  });
  doc.dispose();
  return result;
}
function h20ImageList(html) {
  const doc = new HtmlDocument(html);
  let nodes = doc.querySelectorAll(".reading-content img");
  if (!nodes || nodes.length === 0) nodes = doc.querySelectorAll("img");
  const images = [];
  const seen = {};
  nodes.forEach((img) => {
    let src = h20Attr(img, ["data-src", "data-lazy-src", "data-original", "data-cfsrc", "src"]);
    if (!src || /^data:/i.test(src)) return;
    src = h20Abs(src);
    if (!seen[src]) { seen[src] = true; images.push(src); }
  });
  doc.dispose();
  return images;
}

class Hentai20Source extends ComicSource {
  name = "Hentai20";
  key = "hentai20_io_v2";
  version = "1.0.2";
  minAppVersion = "1.0.0";
  url = "https://cdn.jsdelivr.net/gh/1753454035/hentai20-venera@main/hentai20.js";

  explore = [
    {
      title: "最新更新",
      type: "multiPageComicList",
      load: async (page) => {
        const html = await h20Fetch(h20PageUrl(H20_HOME, page || 1));
        return { comics: h20ParseComics(html), maxPage: h20MaxPage(html) };
      }
    },
    {
      title: "首页热门",
      type: "multiPageComicList",
      load: async (page) => {
        const html = await h20Fetch(h20PageUrl(H20_HOME, page || 1));
        return { comics: h20ParseComics(html), maxPage: h20MaxPage(html) };
      }
    }
  ];


  search = {
    load: async (keyword, options, page) => {
      const q = String(keyword || "").trim();
      if (!q) return { comics: [], maxPage: 1 };
      const url = H20_BASE + "/?s=" + encodeURIComponent(q) + "&post_type=wp-manga" + ((page || 1) > 1 ? "&paged=" + page : "");
      const html = await h20Fetch(url);
      return { comics: h20ParseComics(html), maxPage: h20MaxPage(html) };
    },
    optionList: [],
    enableTagsSuggestions: false
  };

  comic = {
    loadInfo: async (id) => {
      const url = h20Abs(id);
      const html = await h20Fetch(url);
      const doc = new HtmlDocument(html);
      const titleEl = doc.querySelector(".post-title h1") || doc.querySelector("h1");
      const title = h20Text(titleEl) || "Hentai20 comic";
      const img = doc.querySelector(".summary_image img") || doc.querySelector("meta[property='og:image']");
      let cover = h20Attr(img, ["data-src", "data-lazy-src", "src", "content"]);
      const descEl = doc.querySelector(".description-summary") || doc.querySelector(".summary__content") || doc.querySelector(".description");
      const description = h20Text(descEl);
      const chapters = {};
      const chapterLinks = doc.querySelectorAll("a[href*='chapter']");
      chapterLinks.forEach((a) => {
        const href = h20Attr(a, ["href"]);
        const label = h20Text(a);
        if (href && label) chapters[h20Abs(href)] = label;
      });
      const tags = new Map();
      const genreLinks = doc.querySelectorAll("a[href*='taxonomy=wp-manga-genre'], a[href*='/genre/']");
      const genres = [];
      genreLinks.forEach((a) => { const t = h20Text(a); if (t && genres.indexOf(t) < 0) genres.push(t); });
      if (genres.length) tags.set("Genre", genres);
      doc.dispose();
      return new ComicDetails({
        title: title,
        cover: h20Abs(cover),
        description: description,
        tags: tags,
        chapters: chapters,
        url: url
      });
    },
    loadEp: async (comicId, epId) => {
      if (!epId) throw "Missing chapter URL";
      const html = await h20Fetch(h20Abs(epId));
      const images = h20ImageList(html);
      if (!images.length) throw "没有从章节页面找到图片。网站可能调整了阅读器结构或要求额外验证。";
      return { images: images };
    },
    onImageLoad: (url) => ({
      headers: {
        "Referer": H20_BASE + "/",
        "User-Agent": H20_HEADERS["User-Agent"]
      }
    }),
    link: {
      domains: ["hentai20.io", "img.hentai1.io"],
      linkToId: (url) => url && url.indexOf("hentai20.io/manga/") >= 0 ? url : null
    }
  };
}
