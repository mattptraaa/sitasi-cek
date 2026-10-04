(function () {
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var clamp = function (x, a, b) { return Math.min(b === undefined ? 1 : b, Math.max(a === undefined ? 0 : a, x)); };
  var mean = function (a) { return a.reduce(function (s, x) { return s + x; }, 0) / a.length; };
  var sd = function (a) { var m = mean(a); return Math.sqrt(mean(a.map(function (x) { return (x - m) * (x - m); }))); };

  /* Tab */
  function showTab(name) {
    ["sitasi", "skor"].forEach(function (n) {
      var on = n === name;
      $("panel-" + n).hidden = !on;
      $("tab-" + n).classList.toggle("active", on);
      $("tab-" + n).setAttribute("aria-selected", on ? "true" : "false");
    });
  }
  $("tab-sitasi").onclick = function () { showTab("sitasi"); };
  $("tab-skor").onclick = function () { showTab("skor"); };

  /* ===== Cek Sitasi ===== */
  var HEAD = /^\s*(daftar\s+pustaka|daftar\s+referensi|referensi|references|bibliography)\s*:?\s*$/im;

  function splitText(raw) {
    var m = HEAD.exec(raw);
    if (!m) return { body: raw, refs: "" };
    return { body: raw.slice(0, m.index), refs: raw.slice(m.index + m[0].length) };
  }

  function firstWord(s) {
    var m = s.trim().match(/[\p{L}'\-]+/u);
    return m ? m[0].toLowerCase() : "";
  }

  function extractCitations(body) {
    var found = {};
    function add(name, year, label) {
      var k = firstWord(name) + year.toLowerCase();
      if (firstWord(name) && !found[k]) found[k] = { name: firstWord(name), year: year, label: label };
    }
    var paren = /\(([^()]*?\d{4}[a-z]?[^()]*)\)/g, m;
    while ((m = paren.exec(body)) !== null) {
      m[1].split(";").forEach(function (part) {
        var t = part.match(/([\p{L}'\-]+)[^\d]*?(\d{4}[a-z]?)/u);
        if (t) add(t[1], t[2], "(" + part.trim() + ")");
      });
    }
    var narr = /([\p{Lu}][\p{L}'\-]+)(?:\s+(?:dkk\.?|et al\.?|dan\s+[\p{L}'\-]+|&\s*[\p{L}'\-]+))?\s*\((\d{4}[a-z]?)\)/gu;
    while ((m = narr.exec(body)) !== null) add(m[1], m[2], m[0]);
    return found;
  }

  function extractRefs(text) {
    var lines = text.split(/\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    var entries = [];
    lines.forEach(function (l) {
      var startsNew = /\((\d{4}[a-z]?|n\.d\.|t\.t\.)\)/.test(l.slice(0, 220)) || !entries.length;
      if (startsNew) entries.push(l); else entries[entries.length - 1] += " " + l;
    });
    return entries.map(function (e) {
      var head = e.split(/[,.(]/)[0];
      var y = e.match(/\((\d{4}[a-z]?)\)/);
      var doi = e.match(/10\.\d{4,9}\/[^\s]+/);
      return {
        text: e, name: firstWord(head), sortKey: head.trim().toLowerCase(),
        year: y ? y[1] : "", doi: doi ? doi[0].replace(/[.,;)]+$/, "") : ""
      };
    });
  }

  function list(items, cls) {
    if (!items.length) return '<p class="ok">Tidak ada masalah.</p>';
    return "<ul>" + items.map(function (i) { return '<li class="' + cls + '">' + i + "</li>"; }).join("") + "</ul>";
  }

  function checkSitasi() {
    var raw = $("in-sitasi").value, out = $("out-sitasi");
    out.hidden = false;
    var parts = splitText(raw);
    if (!parts.refs.trim()) {
      out.innerHTML = '<p class="bad">Daftar pustaka tidak ditemukan. Pastikan ada baris judul seperti "Daftar Pustaka" atau "Referensi", lalu daftar entrinya di bawah judul itu.</p>';
      return;
    }
    var cites = extractCitations(parts.body), refs = extractRefs(parts.refs);
    var refKeys = {};
    refs.forEach(function (r) { refKeys[r.name + r.year.toLowerCase()] = true; });
    var citeKeys = Object.keys(cites);

    var orphan = [], diffYear = [];
    citeKeys.forEach(function (k) {
      var c = cites[k];
      if (refKeys[k]) return;
      var sameName = refs.filter(function (r) { return r.name === c.name; });
      if (sameName.length) {
        diffYear.push(esc(c.label) + ": di daftar pustaka tahunnya " + sameName.map(function (r) { return esc(r.year || "tidak ada"); }).join(", "));
      } else {
        orphan.push(esc(c.label) + ": tidak ada di daftar pustaka");
      }
    });
    var unused = refs.filter(function (r) { return !cites[r.name + r.year.toLowerCase()] && !citeKeys.some(function (k) { return cites[k].name === r.name; }); })
      .map(function (r) { return esc(r.text.slice(0, 90)) + (r.text.length > 90 ? "..." : "") + ": tidak dikutip di isi tulisan"; });

    var fmt = [], now = new Date().getFullYear();
    refs.forEach(function (r, i) {
      var short = esc(r.text.slice(0, 60)) + "...";
      if (!r.year) fmt.push(short + " tidak punya tahun dalam kurung");
      else if (/^\d{4}/.test(r.year) && parseInt(r.year, 10) > now) fmt.push(short + " tahun " + esc(r.year) + " melebihi tahun sekarang");
      if (i > 0 && r.sortKey && refs[i - 1].sortKey && r.sortKey.localeCompare(refs[i - 1].sortKey, "id") < 0) fmt.push(short + " tidak urut abjad setelah entri sebelumnya");
    });

    var nDoi = refs.filter(function (r) { return r.doi; }).length;
    out.innerHTML =
      '<div class="summary">' +
      '<div class="stat"><b>' + citeKeys.length + "</b><span>sitasi di isi</span></div>" +
      '<div class="stat"><b>' + refs.length + "</b><span>entri pustaka</span></div>" +
      '<div class="stat"><b>' + (orphan.length + diffYear.length + unused.length + fmt.length) + "</b><span>hal perlu dicek</span></div></div>" +
      '<div class="group"><h3>Sitasi tanpa pustaka</h3>' + list(orphan, "bad") + "</div>" +
      '<div class="group"><h3>Nama sama, tahun berbeda</h3>' + list(diffYear, "warn") + "</div>" +
      '<div class="group"><h3>Pustaka yang tidak dikutip</h3>' + list(unused, "warn") + "</div>" +
      '<div class="group"><h3>Format dasar</h3>' + list(fmt, "warn") + "</div>" +
      '<div class="group"><h3>Validasi DOI lewat Crossref</h3>' +
      (nDoi ? '<p class="small">' + nDoi + ' entri punya DOI. Butuh koneksi internet.</p><button class="btn ghost" id="run-doi">Validasi DOI</button><div id="out-doi"></div>' : '<p class="small">Tidak ada DOI pada daftar pustaka.</p>') + "</div>" +
      '<div class="note">Pengecekan memakai pola teks sehingga bisa meleset pada nama berawalan seperti van atau de, penulis lembaga, atau format sitasi tidak umum. Anggap hasil sebagai petunjuk, bukan keputusan akhir.</div>';
    if (nDoi) $("run-doi").onclick = function () { validateDoi(refs.filter(function (r) { return r.doi; })); };
  }

  function titleOverlap(a, b) {
    var wa = (a.toLowerCase().match(/[\p{L}\d]{4,}/gu) || []), tb = b.toLowerCase();
    if (!wa.length) return 0;
    return wa.filter(function (w) { return tb.indexOf(w) > -1; }).length / wa.length;
  }

  function validateDoi(items) {
    var btn = $("run-doi"), box = $("out-doi");
    btn.disabled = true; btn.textContent = "Memeriksa...";
    box.innerHTML = "";
    var lines = [];
    var chain = Promise.resolve();
    items.forEach(function (r) {
      chain = chain.then(function () {
        return fetch("https://api.crossref.org/works/" + encodeURIComponent(r.doi).replace(/%2F/g, "/"))
          .then(function (res) { if (!res.ok) throw new Error("nf"); return res.json(); })
          .then(function (j) {
            var msg = j.message, cy = msg.issued && msg.issued["date-parts"] && msg.issued["date-parts"][0] ? String(msg.issued["date-parts"][0][0]) : "";
            var title = (msg.title && msg.title[0]) || "";
            var ov = titleOverlap(title, r.text), problems = [];
            if (cy && r.year && r.year.slice(0, 4) !== cy) problems.push("tahun di Crossref " + cy);
            if (ov < 0.6) problems.push("judul kurang mirip dengan data Crossref");
            lines.push(problems.length
              ? '<li class="warn">' + esc(r.doi) + ": " + problems.join(", ") + "</li>"
              : '<li class="ok">' + esc(r.doi) + ": cocok dengan data Crossref</li>");
          })
          .catch(function () { lines.push('<li class="bad">' + esc(r.doi) + ": tidak ditemukan di Crossref</li>"); });
      });
    });
    chain.then(function () {
      box.innerHTML = "<ul>" + lines.join("") + "</ul>";
      btn.disabled = false; btn.textContent = "Validasi Ulang";
    });
  }

  $("run-sitasi").onclick = checkSitasi;
  $("demo-sitasi").onclick = function () {
    $("in-sitasi").value =
      "Literasi digital menjadi kemampuan penting bagi mahasiswa (Santoso, 2020). Menurut Dewi dan Pratama (2019), mahasiswa perlu memahami etika penggunaan informasi. Penelitian lain menunjukkan hasil serupa (Hidayat dkk., 2021; Rahman, 2018).\n\n" +
      "Daftar Pustaka\n" +
      "Dewi, A., & Pratama, B. (2019). Etika informasi pada mahasiswa. Jurnal Pendidikan Digital, 4(2), 11-20.\n" +
      "Santoso, B. (2021). Literasi digital mahasiswa. Jurnal Teknologi Pendidikan, 10(1), 1-10.\n" +
      "Wijaya, T. (2017). Media pembelajaran daring. Penerbit Kampus.";
  };

  /* ===== Cek Skor Tulisan ===== */
  var TRANSISI = ["selain itu", "oleh karena itu", "dengan demikian", "namun demikian", "di sisi lain", "sebagai kesimpulan", "pada dasarnya", "hal ini menunjukkan", "dalam hal ini", "lebih lanjut", "furthermore", "moreover", "in conclusion", "additionally"];

  function analyze(text) {
    var sents = text.split(/(?<=[.!?])\s+/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 2; });
    var words = text.toLowerCase().match(/[\p{L}']+/gu) || [];
    var paras = text.split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean);
    if (words.length < 40 || sents.length < 3) return null;

    var lens = sents.map(function (s) { return (s.match(/[\p{L}']+/gu) || []).length; });
    var cv = sd(lens) / mean(lens), sSent = clamp(1 - cv / 0.7);

    var sample = words.slice(0, 100), ttr = new Set(sample).size / sample.length, sVocab = clamp((0.8 - ttr) / 0.35);

    var low = text.toLowerCase(), hits = 0;
    TRANSISI.forEach(function (k) { hits += low.split(k).length - 1; });
    var dens = hits / words.length * 100, sTrans = clamp(dens / 2.5);

    var starts = sents.map(function (s) { return (s.toLowerCase().match(/[\p{L}']+/u) || [""])[0]; });
    var rep = 1 - new Set(starts).size / starts.length, sStart = clamp(rep / 0.5);

    var sPara = 0.5, cvP = null;
    if (paras.length >= 3) {
      var pl = paras.map(function (p) { return p.split(/\s+/).length; });
      cvP = sd(pl) / mean(pl); sPara = clamp(1 - cvP / 0.6);
    }
    var total = Math.round(100 * (sSent * 0.30 + sVocab * 0.20 + sTrans * 0.20 + sStart * 0.15 + sPara * 0.15));
    return {
      total: total, w: words.length, s: sents.length,
      items: [
        ["Variasi panjang kalimat", sSent, "CV " + cv.toFixed(2) + ", makin kecil makin seragam"],
        ["Keragaman kosakata", sVocab, "rasio kata unik " + ttr.toFixed(2)],
        ["Kata transisi", sTrans, dens.toFixed(1) + " per 100 kata"],
        ["Pengulangan awal kalimat", sStart, Math.round(rep * 100) + "% awal kalimat berulang"],
        ["Keseragaman paragraf", sPara, cvP === null ? "paragraf kurang dari 3, nilai netral" : "CV " + cvP.toFixed(2)]
      ]
    };
  }

  $("run-skor").onclick = function () {
    var r = analyze($("in-skor").value), out = $("out-skor");
    out.hidden = false;
    if (!r) { out.innerHTML = '<p class="bad">Teks terlalu pendek. Minimal sekitar 40 kata dan 3 kalimat.</p>'; return; }
    var label = r.total < 35 ? "Gaya cukup bervariasi" : r.total < 65 ? "Gaya campuran" : "Gaya sangat seragam";
    out.innerHTML =
      '<div class="small">Skor keseragaman gaya, skala 0 sampai 100</div>' +
      '<div class="bigscore">' + r.total + "</div>" +
      "<div>" + label + ' <span class="small">(' + r.w + " kata, " + r.s + " kalimat)</span></div>" +
      r.items.map(function (it) {
        var p = Math.round(it[1] * 100);
        return '<div class="row"><span>' + it[0] + "</span><span>" + p + '</span></div><div class="bar"><i style="width:' + p + '%"></i></div><div class="small">' + it[2] + "</div>";
      }).join("") +
      '<div class="note">Skor tinggi hanya berarti gaya tulisan seragam dan formal. Tulisan manusia yang rapi bisa kena skor tinggi, dan teks AI yang sudah diedit bisa kena skor rendah. Jangan dipakai untuk menuduh seseorang.</div>';
  };
  $("demo-skor").onclick = function () {
    $("in-skor").value =
      "Pendidikan merupakan faktor penting dalam pembangunan bangsa. Selain itu, pendidikan berperan dalam meningkatkan kualitas sumber daya manusia. Oleh karena itu, pemerintah perlu memperhatikan kualitas pendidikan. Dengan demikian, generasi muda dapat berkembang secara optimal. Selain itu, teknologi juga berperan dalam proses pembelajaran. Oleh karena itu, guru perlu menguasai teknologi digital. Dengan demikian, proses belajar menjadi lebih efektif.\n\n" +
      "Pendidikan merupakan investasi jangka panjang bagi negara. Selain itu, pendidikan membuka peluang kerja yang lebih luas. Oleh karena itu, akses pendidikan harus merata. Dengan demikian, kesenjangan sosial dapat dikurangi.\n\n" +
      "Pendidikan merupakan kunci kemajuan. Selain itu, pendidikan membentuk karakter. Oleh karena itu, semua pihak harus terlibat. Dengan demikian, tujuan nasional tercapai.";
  };
})();
