// ── Placeholder image (SVG inline, no external dependency) ──
const PLACEHOLDER_CARD = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='200' viewBox='0 0 300 200'%3E%3Crect width='300' height='200' fill='%23e2e8f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14' fill='%2394a3b8'%3EImage indisponible%3C/text%3E%3C/svg%3E";
const PLACEHOLDER_THUMB = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' fill='%23e2e8f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='18' fill='%2394a3b8'%3E%3F%3C/text%3E%3C/svg%3E";
const PLACEHOLDER_MODAL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'%3E%3Crect width='300' height='300' fill='%23e2e8f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14' fill='%2394a3b8'%3EImage indisponible%3C/text%3E%3C/svg%3E";
const API_BASE = window.location.origin;
let currentPage = 1;
let currentQuery = "";
let debounceTimer = null;

// ── DOM refs ──
const searchInput   = document.getElementById("searchInput");
const searchBtn     = document.getElementById("searchBtn");
const suggestionsEl = document.getElementById("suggestions");
const productGrid   = document.getElementById("productGrid");
const pagination    = document.getElementById("pagination");
const resultCount   = document.getElementById("resultCount");
const sortSelect    = document.getElementById("sortSelect");
const sidebar       = document.getElementById("sidebar");
const toggleSidebar = document.getElementById("toggleSidebar");
const resetFilters  = document.getElementById("resetFilters");
const modal         = document.getElementById("modal");
const modalBody     = document.getElementById("modalBody");
const modalClose    = document.getElementById("modalClose");
const modalOverlay  = document.getElementById("modalOverlay");
const applyPrice    = document.getElementById("applyPrice");

// ── Events ──
searchInput.addEventListener("input", onSearchInput);
searchInput.addEventListener("keydown", e => { if (e.key === "Enter") doSearch(); });
searchBtn.addEventListener("click", doSearch);
sortSelect.addEventListener("change", doSearch);
toggleSidebar.addEventListener("click", () => sidebar.classList.toggle("open"));
resetFilters.addEventListener("click", resetAllFilters);
modalClose.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", closeModal);
applyPrice.addEventListener("click", doSearch);
document.getElementById("filterStock").addEventListener("change", doSearch);
document.querySelectorAll('input[name="note"]').forEach(r => r.addEventListener("change", doSearch));
document.addEventListener("click", e => {
    if (!e.target.closest(".search-box")) suggestionsEl.classList.add("hidden");
});

// Toggle filter sections
document.querySelectorAll(".filter-title[data-toggle]").forEach(title => {
    title.addEventListener("click", () => {
        const target = document.getElementById(title.dataset.toggle);
        target.style.display = target.style.display === "none" ? "" : "none";
        title.querySelector(".chevron").style.transform =
            target.style.display === "none" ? "rotate(-90deg)" : "";
    });
});

// ── Search Input (autocomplete) ──
function onSearchInput() {
    const q = searchInput.value.trim();
    clearTimeout(debounceTimer);
    if (q.length < 2) {
        suggestionsEl.classList.add("hidden");
        return;
    }
    debounceTimer = setTimeout(() => fetchSuggestions(q), 250);
}

async function fetchSuggestions(q) {
    try {
        const res = await fetch(`${API_BASE}/api/suggestions?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!data.length) { suggestionsEl.classList.add("hidden"); return; }

        suggestionsEl.innerHTML = data.map(item => `
            <div class="suggestion-item" data-name="${escapeHtml(item.nom)}">
                <img src="${item.image || PLACEHOLDER_THUMB}" alt=""
                     onerror="this.onerror=null;this.src=PLACEHOLDER_THUMB">
                <div class="suggestion-info">
                    <div class="name">${escapeHtml(item.nom)}</div>
                    <div class="brand">${escapeHtml(item.marque)}</div>
                </div>
                ${item.prix ? `<span class="suggestion-price">${item.prix.toFixed(2)} €</span>` : ""}
            </div>
        `).join("");

        suggestionsEl.querySelectorAll(".suggestion-item").forEach(el => {
            el.addEventListener("click", () => {
                searchInput.value = el.dataset.name;
                suggestionsEl.classList.add("hidden");
                doSearch();
            });
        });

        suggestionsEl.classList.remove("hidden");
    } catch (err) {
        console.error("Suggestions error:", err);
    }
}

// ── Main Search ──
async function doSearch(page) {
    if (typeof page === "number") currentPage = page;
    else currentPage = 1;

    currentQuery = searchInput.value.trim();

    const params = new URLSearchParams();
    if (currentQuery) params.set("q", currentQuery);
    params.set("page", currentPage);
    params.set("size", 12);
    params.set("tri", sortSelect.value);

    // Filters
    getCheckedValues("filterCategories").forEach(v => params.append("categories", v));
    getCheckedValues("filterMarques").forEach(v => params.append("marque", v));

    const prixMin = document.getElementById("prixMin").value;
    const prixMax = document.getElementById("prixMax").value;
    if (prixMin) params.set("prix_min", prixMin);
    if (prixMax) params.set("prix_max", prixMax);

    if (document.getElementById("filterStock").checked) params.set("en_stock", "true");

    const noteMin = document.querySelector('input[name="note"]:checked')?.value;
    if (noteMin) params.set("note_min", noteMin);

    getCheckedValues("filterTags").forEach(v => params.append("tags", v));

    // Loading state
    productGrid.innerHTML = '<div class="loading"><div class="spinner"></div><p>Recherche…</p></div>';
    pagination.innerHTML = "";

    try {
        const res = await fetch(`${API_BASE}/api/search?${params}`);
        const data = await res.json();
        renderResults(data);
        renderPagination(data);
        renderAggregations(data.aggregations);
        sidebar.classList.remove("open");
    } catch (err) {
        console.error("Search error:", err);
        productGrid.innerHTML = '<div class="empty-state"><div class="emoji">⚠️</div><h3>Erreur de connexion</h3><p>Impossible de contacter le serveur.</p></div>';
    }
}

// ── Render Results ──
function renderResults(data) {
    resultCount.textContent = `${data.total} résultat${data.total !== 1 ? "s" : ""} trouvé${data.total !== 1 ? "s" : ""}`;

    if (!data.hits.length) {
        productGrid.innerHTML = '<div class="empty-state"><div class="emoji">🔍</div><h3>Aucun résultat</h3><p>Essayez avec d\'autres termes de recherche.</p></div>';
        return;
    }

    productGrid.innerHTML = data.hits.map(p => {
        const hasPromo = p.prix.promotion_actif && p.prix.prix_promotionnel;
        const priceHtml = hasPromo
            ? `<div class="card-price-promo">
                   <span class="old-price">${p.prix.valeur.toFixed(2)} €</span>
                   <span class="promo-price">${p.prix.prix_promotionnel.toFixed(2)} €</span>
               </div>`
            : `<span class="card-price">${p.prix.valeur.toFixed(2)} €</span>`;

        const highlight = p._highlight || {};
        const nom = highlight.nom ? highlight.nom[0] : escapeHtml(p.nom);

        return `
        <div class="product-card" onclick="showProduct('${escapeHtml(p.id)}')">
            <div class="card-img-wrapper">
                <img src="${p.images || PLACEHOLDER_CARD}" alt="${escapeHtml(p.nom)}"
                     loading="lazy" onerror="this.onerror=null;this.src=PLACEHOLDER_CARD">
                ${hasPromo ? '<span class="promo-badge">PROMO</span>' : ""}
            </div>
            <div class="card-body">
                <div class="card-name">${nom}</div>
                <div class="card-brand">${escapeHtml(p.marque)}</div>
                <div class="card-categories">
                    ${(p.categories || []).slice(0, 3).map(c => `<span class="cat-tag">${escapeHtml(c)}</span>`).join("")}
                </div>
                <div class="card-bottom">
                    ${priceHtml}
                    <div>
                        <div class="card-rating">
                            <span class="stars">${renderStars(p.evaluations.note_moyenne)}</span>
                            <span>${p.evaluations.note_moyenne.toFixed(1)}</span>
                            <span>(${p.evaluations.nombre_avis})</span>
                        </div>
                        <span class="card-stock ${p.disponibilite.en_stock ? 'stock-in' : 'stock-out'}">
                            ${p.disponibilite.en_stock ? 'En stock' : 'Rupture'}
                        </span>
                    </div>
                </div>
            </div>
        </div>`;
    }).join("");
}

// ── Render Pagination ──
function renderPagination(data) {
    if (data.pages <= 1) { pagination.innerHTML = ""; return; }

    let html = "";
    html += `<button class="page-btn" ${currentPage <= 1 ? "disabled" : ""} onclick="doSearch(${currentPage - 1})">← Préc</button>`;

    const start = Math.max(1, currentPage - 2);
    const end = Math.min(data.pages, currentPage + 2);

    if (start > 1) {
        html += `<button class="page-btn" onclick="doSearch(1)">1</button>`;
        if (start > 2) html += `<span class="page-btn" style="border:none;cursor:default">…</span>`;
    }

    for (let i = start; i <= end; i++) {
        html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="doSearch(${i})">${i}</button>`;
    }

    if (end < data.pages) {
        if (end < data.pages - 1) html += `<span class="page-btn" style="border:none;cursor:default">…</span>`;
        html += `<button class="page-btn" onclick="doSearch(${data.pages})">${data.pages}</button>`;
    }

    html += `<button class="page-btn" ${currentPage >= data.pages ? "disabled" : ""} onclick="doSearch(${currentPage + 1})">Suiv →</button>`;
    pagination.innerHTML = html;
}

// ── Render Aggregations (filters) ──
function renderAggregations(aggs) {
    renderFilterList("filterCategories", aggs.categories, "categories");
    renderFilterList("filterMarques", aggs.marques, "marque");
    renderFilterList("filterTags", aggs.tags, "tags");
}

function renderFilterList(containerId, items, paramName) {
    const container = document.getElementById(containerId);
    const currentChecked = getCheckedValues(containerId);

    if (!items || !items.length) {
        container.innerHTML = '<span style="font-size:.78rem;color:var(--text-light)">Aucun</span>';
        return;
    }

    container.innerHTML = items.map(item => `
        <label>
            <input type="checkbox" value="${escapeHtml(item.key)}"
                   ${currentChecked.includes(item.key) ? "checked" : ""}
                   onchange="doSearch()">
            ${escapeHtml(item.key)}
            <span class="filter-count">${item.count}</span>
        </label>
    `).join("");
}

// ── Product Detail Modal ──
async function showProduct(productId) {
    modal.classList.remove("hidden");
    modalBody.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const res = await fetch(`${API_BASE}/api/product/${productId}`);
        const p = await res.json();

        if (p.error) {
            modalBody.innerHTML = `<div class="empty-state"><h3>${p.error}</h3></div>`;
            return;
        }

        const hasPromo = p.prix.promotion_actif && p.prix.prix_promotionnel;
        const priceHtml = hasPromo
            ? `<span class="promo">${p.prix.prix_promotionnel.toFixed(2)} €</span>
               <span class="old">${p.prix.valeur.toFixed(2)} €</span>`
            : `${p.prix.valeur.toFixed(2)} €`;

        modalBody.innerHTML = `
            <div class="modal-product">
                <img src="${p.images || PLACEHOLDER_MODAL}" alt="${escapeHtml(p.nom)}"
                     onerror="this.onerror=null;this.src=PLACEHOLDER_MODAL">
                <div class="modal-info">
                    <h2>${escapeHtml(p.nom)}</h2>
                    <div class="brand">${escapeHtml(p.marque)}</div>
                    <div class="description">${escapeHtml(p.description)}</div>
                    <div class="prix">${priceHtml}</div>

                    <dl class="modal-detail-grid">
                        <dt>Note</dt>
                        <dd>${renderStars(p.evaluations.note_moyenne)} ${p.evaluations.note_moyenne.toFixed(1)} (${p.evaluations.nombre_avis} avis)</dd>

                        <dt>Disponibilité</dt>
                        <dd>
                            <span class="card-stock ${p.disponibilite.en_stock ? 'stock-in' : 'stock-out'}">
                                ${p.disponibilite.en_stock ? `En stock (${p.disponibilite.quantite})` : 'Rupture de stock'}
                            </span>
                        </dd>

                        <dt>Livraison</dt>
                        <dd>${escapeHtml(p.disponibilite.delai_livraison)}</dd>

                        <dt>Couleur</dt>
                        <dd>${(p.caracteristiques.couleur || []).map(escapeHtml).join(", ") || "—"}</dd>

                        <dt>Taille</dt>
                        <dd>${(p.caracteristiques.taille || []).map(escapeHtml).join(", ") || "—"}</dd>

                        <dt>Poids</dt>
                        <dd>${escapeHtml(p.caracteristiques.poids || "—")}</dd>

                        <dt>Matériaux</dt>
                        <dd>${(p.caracteristiques.materiaux || []).map(escapeHtml).join(", ") || "—"}</dd>
                    </dl>

                    <div class="modal-tags">
                        ${(p.categories || []).map(c => `<span class="cat-tag">${escapeHtml(c)}</span>`).join("")}
                        ${(p.tags || []).map(t => `<span class="cat-tag" style="background:#fef3c7;color:#d97706">${escapeHtml(t)}</span>`).join("")}
                    </div>
                </div>
            </div>`;
    } catch (err) {
        modalBody.innerHTML = '<div class="empty-state"><h3>Erreur de chargement</h3></div>';
    }
}

function closeModal() {
    modal.classList.add("hidden");
}

// ── Helpers ──
function getCheckedValues(containerId) {
    return [...document.querySelectorAll(`#${containerId} input[type="checkbox"]:checked`)].map(cb => cb.value);
}

function resetAllFilters() {
    document.querySelectorAll(".sidebar input[type='checkbox']").forEach(cb => cb.checked = false);
    document.querySelector('input[name="note"][value=""]').checked = true;
    document.getElementById("prixMin").value = "";
    document.getElementById("prixMax").value = "";
    doSearch();
}

function renderStars(note) {
    const full = Math.floor(note);
    const half = note - full >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return "★".repeat(full) + (half ? "½" : "") + "☆".repeat(empty);
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Keyboard shortcut: focus search ──
document.addEventListener("keydown", e => {
    if (e.key === "/" && document.activeElement.tagName !== "INPUT") {
        e.preventDefault();
        searchInput.focus();
    }
    if (e.key === "Escape") {
        closeModal();
        suggestionsEl.classList.add("hidden");
    }
});

// ── Init: load all products ──
doSearch();
