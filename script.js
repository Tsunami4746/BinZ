const API_BASE = "http://localhost:5050";

const scrapItems = [
  { name: "Newspaper", rate: "₹14/kg", category: "normal", note: "Market rate tracked for household paper.", icon: "newspaper" },
  { name: "Glass bottles", rate: "₹2/kg", category: "normal", note: "Accepted with mixed scrap pickup.", icon: "wine" },
  { name: "Copies/books", rate: "₹12/kg", category: "normal", note: "Books and notebooks for paper recovery.", icon: "book-open" },
  { name: "PET bottles", rate: "₹8/kg", category: "normal", note: "Clean plastic bottles and containers.", icon: "pet-bottle" },
  { name: "Iron", rate: "₹26/kg", category: "normal", note: "Bulk quote available for heavy items.", icon: "anchor" },
  { name: "Steel", rate: "₹40/kg", category: "normal", note: "Utensils, frames and small steel scrap.", icon: "hard-hat" },
  { name: "Aluminium", rate: "₹105/kg", category: "normal", note: "Cans, frames and clean aluminium scrap.", icon: "package-open" },
  { name: "Copper wire", rate: "₹650/kg", category: "normal", note: "Higher value depends on quality.", icon: "cable" },
  { name: "Cardboard", rate: "₹8/kg", category: "normal", note: "Flattened boxes and packaging.", icon: "package" },
  { name: "Washing machine", rate: "Quote", category: "appliance", note: "Schedule inspection for pickup value.", icon: "washing-machine" },
  { name: "Refrigerator", rate: "Quote", category: "appliance", note: "Condition-based rate and safe handling.", icon: "archive" },
  { name: "Laptop", rate: "Ticket", category: "ewaste", note: "Raise an e-waste ticket for recovery.", icon: "laptop" },
  { name: "Mobile phone", rate: "Ticket", category: "ewaste", note: "Responsible recycling for old devices.", icon: "smartphone" },
  { name: "Battery", rate: "Ticket", category: "ewaste", note: "Separate disposal route for safety.", icon: "battery-charging" }
];

const defaultLeaders = [
  { name: "John Doe", coins: 1200 },
  { name: "Jane Smith", coins: 980 },
  { name: "Alice Brown", coins: 870 }
];

const state = {
  coins: Number(localStorage.getItem("coins") || 5),
  firstName: localStorage.getItem("firstName") || "Guest",
  email: localStorage.getItem("email") || "",
  entries: JSON.parse(localStorage.getItem("impactEntries") || "[]"),
  tickets: Number(localStorage.getItem("tickets") || 0)
};

let lineChart;
let pieChart;

function qs(selector) {
  return document.querySelector(selector);
}

function qsa(selector) {
  return [...document.querySelectorAll(selector)];
}

function setStatus(node, message, isError = false) {
  if (!node) return;
  node.textContent = message;
  node.style.color = isError ? "#b33b27" : "#174e2a";
}

// Thin wrapper around fetch: JSON in, JSON out, throws with the backend's message on failure.
async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }
  return data;
}

function updateCoins(value) {
  state.coins = Math.max(0, Number(value) || 0);
  localStorage.setItem("coins", String(state.coins));
  qs("#coinBalance").textContent = state.coins;
  refreshLeaderboard();
}

// Awards coins server-side when a user is logged in; otherwise falls back to local-only state.
async function awardCoins(delta) {
  if (state.email) {
    try {
      const data = await apiRequest("/rewardCoins", {
        method: "POST",
        body: JSON.stringify({ email: state.email, coins: delta })
      });
      updateCoins(data.coins);
      return;
    } catch (error) {
      console.error("Reward sync failed, falling back to local:", error);
    }
  }
  updateCoins(state.coins + delta);
}

async function refreshLeaderboard() {
  try {
    const data = await apiRequest("/leaderboard");
    const serverLeaders = (data.leaderboard || []).map((user) => ({
      name: user.firstName || "Player",
      coins: user.coins
    }));
    renderLeaderboardRows(serverLeaders);
  } catch (error) {
    // Backend unreachable — fall back to the local demo leaderboard.
    const currentName = state.firstName && state.firstName !== "Guest" ? state.firstName : "Guest";
    renderLeaderboardRows([...defaultLeaders, { name: currentName, coins: state.coins }]);
  }
}

function renderLeaderboardRows(list) {
  const merged = [...list].sort((a, b) => b.coins - a.coins).slice(0, 4);
  const medals = ["🥇", "🥈", "🥉"];

  qs("#leaderboardRows").innerHTML = merged.map((user, index) => `
    <div class="leader-row">
      <span>${index < 3 ? `<span class="rank-medal" aria-label="Rank ${index + 1}">${medals[index]}</span>` : `<span class="rank-plain">${index + 1}.</span>`}</span>
      <span>${user.name}</span>
      <span>${user.coins}</span>
    </div>
  `).join("");
}

function scrapIcon(item) {
  if (item.icon !== "pet-bottle") {
    return `<i data-lucide="${item.icon}"></i>`;
  }

  return `
    <svg class="pet-bottle-icon" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M25 4h14v8H25z" />
      <path d="M28 12h8l2 9 8 8v23c0 5-4 8-9 8H27c-5 0-9-3-9-8V29l8-8 2-9z" />
      <path d="M22 36h20" />
      <path d="M23 48h18" />
      <path d="M29 22h6" />
    </svg>
  `;
}

function renderScrap(filter = "all") {
  const grid = qs("#scrapGrid");
  grid.innerHTML = "";

  scrapItems
    .filter((item) => filter === "all" || item.category === filter)
    .forEach((item) => {
      const card = document.createElement("article");
      card.className = "scrap-card";
      card.innerHTML = `
        <div class="scrap-card-top">
          <div class="scrap-visual">${scrapIcon(item)}</div>
          <span>${item.category === "ewaste" ? "E-waste" : item.category === "appliance" ? "Quote" : "Live rate"}</span>
        </div>
        <h3>${item.name}</h3>
        <div class="rate"><span>${item.rate}</span></div>
        <p>${item.note}</p>
        <button class="button secondary" type="button" data-sell="${item.name}">
          <i data-lucide="${item.category === "ewaste" ? "mail-check" : "shopping-bag"}"></i>
          ${item.category === "ewaste" ? "Raise ticket" : "Sell now"}
        </button>
      `;
      grid.appendChild(card);
    });

  if (window.lucide) window.lucide.createIcons();
}

function computeImpact() {
  const solid = state.entries.reduce((sum, entry) => sum + entry.solid, 0);
  const ewaste = state.entries.reduce((sum, entry) => sum + entry.ewaste, 0);
  const co2 = solid * 0.9 + ewaste * 2.6;
  return { solid, ewaste, co2 };
}

function renderImpact() {
  const { solid, ewaste, co2 } = computeImpact();
  const bottleEquivalent = Math.round(solid * 22);

  qs("#wasteStat").textContent = `${(solid + ewaste).toFixed(1)} kg`;
  qs("#bottleStat").textContent = bottleEquivalent.toLocaleString("en-IN");
  qs("#ticketStat").textContent = String(state.tickets);
  qs("#co2Total").textContent = `${co2.toFixed(1)} kg`;
  qs("#heroImpact").textContent = `${co2.toFixed(1)} kg`;

  const labels = state.entries.map((entry) => entry.date);
  const solidData = state.entries.map((entry) => Number((entry.solid * 0.9).toFixed(2)));
  const ewasteData = state.entries.map((entry) => Number((entry.ewaste * 2.6).toFixed(2)));

  const lineContext = qs("#lineChart");
  const pieContext = qs("#pieChart");

  if (lineChart) lineChart.destroy();
  if (pieChart) pieChart.destroy();

  lineChart = new Chart(lineContext, {
    type: "line",
    data: {
      labels: labels.length ? labels : ["Start"],
      datasets: [
        { label: "Solid Waste CO2", data: solidData.length ? solidData : [0], borderColor: "#356f38", backgroundColor: "rgba(53,111,56,0.12)", tension: 0.35, fill: true },
        { label: "E-Waste CO2", data: ewasteData.length ? ewasteData : [0], borderColor: "#0b7c77", backgroundColor: "rgba(11,124,119,0.12)", tension: 0.35, fill: true }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { boxWidth: 12, color: "#162016" } } },
      scales: { y: { beginAtZero: true, title: { display: true, text: "kg CO2" } } }
    }
  });

  pieChart = new Chart(pieContext, {
    type: "doughnut",
    data: {
      labels: ["Solid Waste", "E-Waste"],
      datasets: [{ data: [solid || 1, ewaste || 0], backgroundColor: ["#6f8f4b", "#0b7c77"], borderWidth: 0 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "66%",
      plugins: { legend: { position: "bottom" } }
    }
  });
}

function openDrawer(id) {
  qsa(".drawer").forEach((drawer) => {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
  });
  const drawer = qs(`#${id}`);
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  qs("#scrim").classList.add("visible");
}

function closeDrawers() {
  qsa(".drawer").forEach((drawer) => {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
  });
  qs("#scrim").classList.remove("visible");
}

function seedToday() {
  const input = qs("#impactDate");
  if (!input.value) input.valueAsDate = new Date();
}

async function init() {
  qs("#coinBalance").textContent = state.coins;
  seedToday();
  renderScrap();
  renderImpact();
  await refreshLeaderboard();

  // If we already know who this browser is, pull their live coin balance from the server.
  if (state.email) {
    try {
      const data = await apiRequest(`/getCoins/${encodeURIComponent(state.email)}`);
      updateCoins(data.coins);
    } catch (error) {
      console.error("Could not sync coin balance from server:", error);
    }
  }

  qsa(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      qsa(".tab").forEach((tab) => tab.classList.remove("active"));
      button.classList.add("active");
      renderScrap(button.dataset.filter);
    });
  });

  qs("#scrapGrid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-sell]");
    if (!button) return;
    const item = scrapItems.find((scrap) => scrap.name === button.dataset.sell);
    if (item.category === "ewaste") {
      qs("#ticketType").value = item.name.includes("Laptop") ? "Laptop" : item.name.includes("Mobile") ? "Mobile phone" : "Battery";
      openDrawer("ticketPanel");
    } else {
      location.hash = "#home";
      qs("#phoneInput").focus();
      setStatus(qs("#pickupStatus"), `${item.name} selected. Add your phone number to book pickup.`);
    }
  });

  qs("#pickupForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const phone = qs("#phoneInput").value.trim();
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setStatus(qs("#pickupStatus"), "Enter a valid Indian 10-digit mobile number.", true);
      return;
    }
    localStorage.setItem("phoneNumber", phone);
    setStatus(qs("#pickupStatus"), "Booking pickup...");

    try {
      if (state.email) {
        await apiRequest("/storePhoneNumber", {
          method: "POST",
          body: JSON.stringify({ email: state.email, phoneNumber: phone })
        });
      }
      await apiRequest("/sendSMS", {
        method: "POST",
        body: JSON.stringify({ phoneNumber: phone })
      });
    } catch (error) {
      // Non-fatal — pickup can still be recorded even if the notification step fails.
      console.error("Pickup notification failed:", error);
    }

    await awardCoins(2);
    setStatus(qs("#pickupStatus"), "Pickup booked. +2 Z-Coins awarded.");
  });

  qs("#impactForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const entry = {
      date: qs("#impactDate").value,
      solid: Number(qs("#solidWaste").value || 0),
      ewaste: Number(qs("#eWaste").value || 0)
    };
    if (!entry.solid && !entry.ewaste) return;
    state.entries.push(entry);
    localStorage.setItem("impactEntries", JSON.stringify(state.entries));
    awardCoins(Math.ceil(entry.solid + entry.ewaste));
    qs("#solidWaste").value = "";
    qs("#eWaste").value = "";
    renderImpact();
  });

  qs("#uploadForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = qs("#videoInput").files[0];
    if (!file) {
      setStatus(qs("#uploadStatus"), "Choose a cleanup video first.", true);
      return;
    }
    if (!state.email) {
      setStatus(qs("#uploadStatus"), "Create an account first so we know who to reward.", true);
      return;
    }

    const formData = new FormData();
    formData.append("video", file);
    formData.append("email", state.email);

    setStatus(qs("#uploadStatus"), "Processing cleanup proof...");
    try {
      const response = await fetch(`${API_BASE}/uploadVideo`, { method: "POST", body: formData });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Upload failed");
      updateCoins(data.coins);
      setStatus(qs("#uploadStatus"), data.message);
    } catch (error) {
      setStatus(qs("#uploadStatus"), error.message || "Could not process video.", true);
    }
  });

  qs("#videoInput").addEventListener("change", (event) => {
    const file = event.target.files[0];
    qs("#fileLabel").textContent = file ? file.name : "Choose cleanup video";
  });

  qs("#authForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const firstName = qs("#firstName").value.trim();
    const lastName = qs("#lastName").value.trim();
    const email = qs("#email").value.trim().toLowerCase();
    const stateValue = qs("#state").value.trim();

    if (!firstName || !lastName || !email || !stateValue) {
      setStatus(qs("#authStatus"), "First name, last name, email and state are required.", true);
      return;
    }

    setStatus(qs("#authStatus"), "Saving account...");

    try {
      let data;
      try {
        // New account.
        data = await apiRequest("/register", {
          method: "POST",
          body: JSON.stringify({ firstName, lastName, email, state: stateValue })
        });
        state.firstName = data.User.firstName;
        state.email = data.User.email;
        var serverCoins = data.User.coins;
      } catch (registerError) {
        // Already registered on this backend — treat as a login by email.
        data = await apiRequest("/login", {
          method: "POST",
          body: JSON.stringify({ email })
        });
        state.firstName = data.firstName;
        state.email = data.email;
        var serverCoins = data.coins;
      }

      localStorage.setItem("firstName", state.firstName);
      localStorage.setItem("lastName", lastName);
      localStorage.setItem("email", state.email);
      localStorage.setItem("state", stateValue);

      updateCoins(serverCoins);
      setStatus(qs("#authStatus"), `Welcome, ${state.firstName}. Account synced with server.`);
    } catch (error) {
      setStatus(qs("#authStatus"), error.message || "Could not reach server.", true);
    }
  });

  qs("#ticketForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const descriptionField = qs("#ticketDescription");

    setStatus(qs("#ticketStatus"), "Submitting ticket...");
    try {
      const data = await apiRequest("/submit-ticket", {
        method: "POST",
        body: JSON.stringify({
          name: state.firstName,
          email: state.email || "guest@example.com",
          eWasteType: qs("#ticketType").value,
          description: descriptionField ? descriptionField.value.trim() : ""
        })
      });
      state.tickets += 1;
      localStorage.setItem("tickets", String(state.tickets));
      await awardCoins(3);
      renderImpact();
      setStatus(qs("#ticketStatus"), `Ticket ${data.ticketID} submitted. +3 Z-Coins awarded.`);
    } catch (error) {
      setStatus(qs("#ticketStatus"), error.message || "Could not submit ticket.", true);
    }
  });

  qsa("[data-open]").forEach((button) => {
    button.addEventListener("click", () => openDrawer(button.dataset.open));
  });

  qsa("[data-close]").forEach((button) => {
    button.addEventListener("click", closeDrawers);
  });

  qs("#accountButton").addEventListener("click", () => openDrawer("authPanel"));
  qs("#chatFab").addEventListener("click", () => openDrawer("chatDrawer"));
  qs("#openChatFromCard").addEventListener("click", () => openDrawer("chatDrawer"));
  qs("#scrim").addEventListener("click", closeDrawers);

  qsa("[data-chat]").forEach((button) => {
    button.addEventListener("click", () => {
      qs("#chatResponse").textContent = button.dataset.chat;
    });
  });

  qs(".menu-toggle").addEventListener("click", () => {
    const nav = qs("#primary-nav");
    const open = nav.classList.toggle("open");
    qs(".menu-toggle").setAttribute("aria-expanded", String(open));
  });

  qsa(".primary-nav a").forEach((link) => {
    link.addEventListener("click", () => qs("#primary-nav").classList.remove("open"));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDrawers();
  });

  if (window.lucide) window.lucide.createIcons();
}

document.addEventListener("DOMContentLoaded", init);