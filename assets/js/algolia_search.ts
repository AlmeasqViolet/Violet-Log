// Header search box powered by the local Hugo index (algolia.json).
//
// The theme ships an Algolia modal; this implements a persistent search bar in
// the top navigation instead: type, get a dropdown of matching posts.

const SEARCH_INDEX_URL = "{{ "algolia.json" | relURL }}";
const SEARCH_MORE_TEXT = '{{ i18n "more" }}';

(function () {
  const input = document.getElementById("nav-search-input") as HTMLInputElement | null;
  const panel = document.querySelector(".nav-search-results") as HTMLElement | null;
  const statsBox = document.getElementById("nav-search-stats");
  const hitsBox = document.getElementById("nav-search-hits");
  const moreBox = document.getElementById("nav-search-more");
  if (!input || !panel || !hitsBox) return;

  const config = (window as any).ALGOLIA_CONFIG || {};
  const settings = config.algolia || {};
  const labels = settings.labels || {};
  const labelEmpty = labels.hits_empty || "No results found for \u300c${query}\u300d";
  const labelStats = labels.hits_stats || "Found ${hits} results";
  const pageSize = parseInt(settings.hits && settings.hits.per_page, 10) || 10;

  let docs: any[] | null = null;
  let indexPromise: Promise<any[]> | null = null;
  let results: any[] = [];
  let renderedCount = 0;
  let requestToken = 0;
  let debounceTimer = 0;
  let composing = false;
  let lastQuery: string | null = null;
  let regexKey = "";
  let regexValue: RegExp | null = null;

  function escapeHtml(value: any): string {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      } as any)[ch];
    });
  }

  function decodeEntities(text: string): string {
    return String(text || "").replace(/&(amp|lt|gt|quot|#39|#x27);/g, function (_m, entity) {
      return ({
        amp: "&",
        lt: "<",
        gt: ">",
        quot: '"',
        "#39": "'",
        "#x27": "'",
      } as any)[entity];
    });
  }

  function highlightRegex(terms: string[]): RegExp | null {
    const key = terms.join("\u0000");
    if (key === regexKey) return regexValue;
    regexKey = key;
    regexValue = null;
    const usable = terms
      .filter(Boolean)
      .map(function (term) {
        return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      });
    if (!usable.length) return null;
    try {
      regexValue = new RegExp("(" + usable.join("|") + ")", "gi");
    } catch (error) {
      regexValue = null;
    }
    return regexValue;
  }

  function highlight(text: string, terms: string[]): string {
    const pattern = highlightRegex(terms);
    if (!pattern) return escapeHtml(text);
    return text
      .split(pattern)
      .map(function (part, index) {
        return index % 2 ? "<mark>" + escapeHtml(part) + "</mark>" : escapeHtml(part);
      })
      .join("");
  }

  function countOccurrences(haystack: string, needle: string): number {
    let count = 0;
    let from = 0;
    for (;;) {
      const found = haystack.indexOf(needle, from);
      if (found < 0) break;
      count += 1;
      from = found + needle.length;
      if (count >= 20) break;
    }
    return count;
  }

  function loadIndex(): Promise<any[]> {
    if (docs) return Promise.resolve(docs);
    if (indexPromise) return indexPromise;
    indexPromise = fetch(SEARCH_INDEX_URL, { credentials: "same-origin" })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (list: any[]) {
        docs = (list || []).map(function (entry: any) {
          const content = decodeEntities(entry.content || "");
          return {
            title: entry.title || "",
            titleLower: String(entry.title || "").toLowerCase(),
            permalink: entry.permalink || "/",
            content: content,
            contentLower: content.toLowerCase(),
          };
        });
        return docs as any[];
      });
    return indexPromise;
  }

  function makeSnippet(doc: any, terms: string[]): string {
    const lower = doc.contentLower;
    let position = -1;
    for (let i = 0; i < terms.length; i++) {
      const found = lower.indexOf(terms[i]);
      if (found >= 0 && (position < 0 || found < position)) position = found;
    }
    if (position < 0) return "";
    const start = Math.max(0, position - 40);
    const raw = doc.content.slice(start, start + 140);
    return highlight((start > 0 ? "\u2026" : "") + raw + "\u2026", terms);
  }

  function setStats(text: string) {
    if (statsBox) statsBox.innerHTML = text ? escapeHtml(text) : "";
  }

  function toggleMore(visible: boolean) {
    if (!moreBox) return;
    moreBox.innerHTML = visible
      ? '<button type="button" class="nav-search-more-btn">' + escapeHtml(SEARCH_MORE_TEXT) + "</button>"
      : "";
  }

  function showPanel() {
    panel!.hidden = false;
  }

  function hidePanel() {
    panel!.hidden = true;
  }

  function renderMore() {
    if (!hitsBox) return;
    const terms = input!.value.toLowerCase().split(/\s+/).filter(Boolean);
    const chunk = results.slice(renderedCount, renderedCount + pageSize);
    const parts: string[] = [];
    for (let i = 0; i < chunk.length; i++) {
      const doc = chunk[i];
      const title = doc.title || doc.permalink;
      parts.push(
        '<a class="nav-search-hit" href="' + escapeHtml(doc.permalink) + '">' +
          '<div class="nav-search-hit-title">' + highlight(title, terms) + "</div>" +
          (makeSnippet(doc, terms)
            ? '<div class="nav-search-hit-excerpt">' + makeSnippet(doc, terms) + "</div>"
            : "") +
          "</a>",
      );
    }
    renderedCount += chunk.length;
    hitsBox.insertAdjacentHTML("beforeend", parts.join(""));
    toggleMore(renderedCount < results.length);
  }

  function runSearch() {
    const query = input!.value;
    if (!query.trim()) {
      results = [];
      renderedCount = 0;
      hitsBox!.innerHTML = "";
      setStats("");
      toggleMore(false);
      hidePanel();
      lastQuery = "";
      return;
    }
    if (query === lastQuery) {
      showPanel();
      return;
    }
    lastQuery = query;

    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    showPanel();
    setStats("…");

    loadIndex().then(
      function (list) {
        if (input!.value !== query) return;
        const started = Date.now();
        const scored: any[] = [];

        for (let i = 0; i < list.length; i++) {
          const doc = list[i];
          let score = 0;
          let matchedAll = true;
          for (let t = 0; t < terms.length; t++) {
            const term = terms[t];
            const inTitle = doc.titleLower.indexOf(term) >= 0;
            const inContent = doc.contentLower.indexOf(term) >= 0;
            if (!inTitle && !inContent) {
              matchedAll = false;
              break;
            }
            if (inTitle) score += 10;
            if (inContent) score += 1 + Math.min(4, countOccurrences(doc.contentLower, term));
          }
          if (matchedAll) scored.push({ doc: doc, score: score });
        }

        scored.sort(function (a, b) {
          return b.score - a.score;
        });
        results = scored.map(function (item) {
          return item.doc;
        });
        renderedCount = 0;
        hitsBox!.innerHTML = "";

        setStats(
          labelStats
            .replace("${hits}", String(results.length))
            .replace("${time}", String(Date.now() - started)),
        );

        if (!results.length) {
          hitsBox!.innerHTML =
            '<div class="nav-search-empty">' +
            escapeHtml(labelEmpty.replace("${query}", query)) +
            "</div>";
          toggleMore(false);
          return;
        }
        renderMore();
      },
      function () {
        lastQuery = null;
        hitsBox!.innerHTML = '<div class="nav-search-empty">Search index failed to load.</div>';
        toggleMore(false);
      },
    );
  }

  function scheduleSearch() {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(runSearch, 120);
  }

  input.addEventListener("compositionstart", function () {
    composing = true;
  });
  input.addEventListener("compositionend", function () {
    composing = false;
    scheduleSearch();
  });
  input.addEventListener("input", function (event: any) {
    if (composing || event.isComposing) return;
    scheduleSearch();
  });
  input.addEventListener("keydown", function (event: any) {
    if (event.key === "Escape") {
      hidePanel();
      input.blur();
      return;
    }
    if (event.key !== "Enter") return;
    if (composing || event.isComposing || event.keyCode === 229) return;
    window.clearTimeout(debounceTimer);
    runSearch();
  });
  input.addEventListener("focus", function () {
    loadIndex().catch(function () {});
    if (input.value.trim()) showPanel();
  });

  document.addEventListener("click", function (event) {
    const target = event.target as HTMLElement | null;
    if (target && target.closest(".nav-search")) return;
    hidePanel();
  });

  panel.addEventListener("click", function (event) {
    const target = event.target as HTMLElement | null;
    if (target && target.classList.contains("nav-search-more-btn")) {
      renderMore();
    }
  });
})();
