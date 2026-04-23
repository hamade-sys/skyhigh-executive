// ============================================================
// SkyHigh Executive — UI Controller  v2.0
// All 28 Air Tycoon-inspired features implemented.
// ============================================================
window.SkyHigh = window.SkyHigh || {};

window.SkyHigh.UI = (() => {
  'use strict';

  // ── STATE ─────────────────────────────────────────────────
  let currentScreen   = 'splash';
  let selectedPlaneId = 'NARROWBODY';
  let tickerMessages  = [];
  let tickerIdx       = 0;
  let overlay         = null;

  // ── GUIDE CAPTAIN MARCUS STATE ────────────────────────────
  let _guideStep   = 0;
  let _guideActive = false;
  let _endQuarterClickedOnce = false;

  const _guideSteps = [
    {
      trigger: 'roundStart1',
      text: "Welcome aboard! I'm Captain Marcus, your advisor for the first 5 quarters. You start with $50M and 2 A320neo aircraft. Your first job: open a route from your hub airport. Click your hub (the glowing amber dot) on the map to begin.",
      highlight: 'map',
    },
    {
      trigger: 'afterFirstClick',
      text: "Great! You can see details about your hub airport. Now click any other airport on the map to open a route. Start with a nearby city — your A320neo has a 6,300km range.",
      highlight: 'map',
    },
    {
      trigger: 'routeProjection',
      text: "This is your Route Projection panel. It shows estimated revenue, costs, and profit. Adjust flights per week and fare multiplier. When you're happy with the numbers, click 'Confirm Route'. Routes need an aircraft type selected.",
      highlight: 'projection',
    },
    {
      trigger: 'afterFirstRoute',
      text: "Route opened! ✈ It shows '⏳ Awaiting Q-End' because revenue is calculated at quarter end. You can open more routes, invest in Safety or Crew training, or click 'End Quarter' when ready. Each action costs 1 AP — you have 3 per quarter.",
      highlight: 'sidebar',
    },
    {
      trigger: 'beforeEndQuarter',
      text: "Clicking 'End Quarter' locks in your decisions, then presents a crisis event (board decision or world event). After resolving it, your quarterly results appear — revenue, costs, and net profit across all routes.",
      highlight: 'endBtn',
    },
    {
      trigger: 'afterFirstCrisis',
      text: "Crisis resolved! Each decision has lasting effects — some earn Cascade Cards (permanent bonuses or penalties). After the results screen, the next quarter begins. By Q5 you'll be flying solo — I'll step back then. Good luck!",
      highlight: null,
    },
  ];

  // Route projection state
  let projState = {
    flightsPerWeek: 7,
    fareMultiplier: 1.0,
    routeType: 'PAX',
    bizClass: false,
  };

  // Fleet tab / filter state
  let fleetTab = 'new';
  let fleetMfr = 'ALL';

  // Tutorial steps
  const TUTORIAL_STEPS = [
    { title: 'Welcome to SkyHigh!',       text: 'You\'re the new CEO. Build routes, survive crises, and create a legacy over 20 quarters. Let me show you the basics.' },
    { title: 'Your Home Hub',             text: 'The glowing amber airport is your hub. Click it to see your Hangar — fleet and active routes all in one place.' },
    { title: 'Opening Your First Route',  text: 'Click any other airport on the map, then press "→ Open Route from Hub". Set your schedule and fare, then confirm!' },
    { title: 'End the Quarter',           text: 'When you\'re ready, hit "End Quarter Command" in the sidebar. A crisis may follow — choose wisely.' },
    { title: 'Grow Your Empire',          text: 'Buy new planes, lease for flexibility, or upgrade facilities at airports. Your star rating grows with your reputation. Good luck! ✈' },
  ];

  // ── SCREEN MANAGEMENT ────────────────────────────────────
  const UI = {

    init() {
      UI._bindSetup();
      UI._bindGameControls();
      UI._bindMapEvents();
      UI._bindKeyboard();
      UI._bindModalClose();
      UI.showScreen('splash');
      setInterval(UI._advanceTicker, 8000);
    },

    showScreen(id) {
      document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
      });
      const screen = document.getElementById(`screen-${id}`);
      if (!screen) return;
      screen.style.display = 'flex';
      requestAnimationFrame(() => {
        screen.classList.add('active');
        screen.classList.add('screen-enter');
        setTimeout(() => screen.classList.remove('screen-enter'), 600);
      });
      currentScreen = id;
    },

    // ── SETUP SCREEN ─────────────────────────────────────
    _bindSetup() {
      // Populate logo picker
      const grid = document.getElementById('logo-picker-grid');
      if (grid && SkyHigh.AIRLINE_LOGOS) {
        grid.innerHTML = SkyHigh.AIRLINE_LOGOS.map((logo, i) =>
          `<div class="logo-opt ${i === 0 ? 'selected' : ''}" data-logo="${logo.id}" onclick="SkyHigh.UI.selectLogo('${logo.id}','${logo.emoji}','${logo.name}')">
            <span class="logo-opt-emoji">${logo.emoji}</span>
            <span class="logo-opt-name">${logo.name}</span>
          </div>`
        ).join('');
      }

      // Doctrine selection
      document.querySelectorAll('.doctrine-card').forEach(card => {
        card.addEventListener('click', () => {
          document.querySelectorAll('.doctrine-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
        });
      });

      // Hub dropdown
      UI._initHubDropdown();

      document.getElementById('btn-start-game')?.addEventListener('click', UI._startGame);
    },

    // ── HUB AIRPORT DROPDOWN ──────────────────────────────
    _initHubDropdown() {
      const wrapper = document.getElementById('hub-dropdown-wrapper');
      if (!wrapper) return;

      const airports = (SkyHigh.MAP_DATA?.airports || []).filter(a => a.hubLevel >= 3);

      // ISO numeric → alpha-2 for flag emoji
      const ISO2 = {
        8:'AL',12:'DZ',24:'AO',31:'AZ',32:'AR',36:'AU',40:'AT',44:'BS',48:'BH',50:'BD',
        51:'AM',56:'BE',68:'BO',76:'BR',100:'BG',104:'MM',116:'KH',120:'CM',124:'CA',
        144:'LK',152:'CL',156:'CN',158:'TW',170:'CO',180:'CD',188:'CR',191:'HR',192:'CU',
        203:'CZ',208:'DK',214:'DO',218:'EC',231:'ET',233:'EE',246:'FI',250:'FR',258:'PF',
        266:'GA',268:'GE',276:'DE',288:'GH',300:'GR',316:'GU',320:'GT',344:'HK',348:'HU',
        352:'IS',356:'IN',360:'ID',364:'IR',368:'IQ',372:'IE',376:'IL',380:'IT',388:'JM',
        392:'JP',398:'KZ',400:'JO',404:'KE',410:'KR',414:'KW',417:'KG',418:'LA',422:'LB',
        428:'LV',434:'LY',440:'LT',446:'MO',450:'MG',454:'MW',458:'MY',462:'MV',466:'ML',
        480:'MU',484:'MX',504:'MA',508:'MZ',512:'OM',516:'NA',524:'NP',528:'NL',554:'NZ',
        566:'NG',578:'NO',586:'PK',591:'PA',600:'PY',604:'PE',608:'PH',616:'PL',620:'PT',
        630:'PR',634:'QA',642:'RO',643:'RU',646:'RW',686:'SN',688:'RS',702:'SG',704:'VN',
        705:'SI',710:'ZA',716:'ZW',724:'ES',752:'SE',756:'CH',762:'TJ',764:'TH',768:'TG',
        784:'AE',788:'TN',792:'TR',795:'TM',800:'UG',804:'UA',807:'MK',818:'EG',826:'GB',
        834:'TZ',840:'US',854:'BF',858:'UY',860:'UZ',862:'VE',894:'ZM',
      };

      function flag(iso) {
        const a2 = ISO2[iso];
        if (!a2) return '🌐';
        return a2.split('').map(c => String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))).join('');
      }

      // Sort: by country alpha-2, then city
      const sorted = [...airports].sort((a, b) => {
        const ca = ISO2[a.countryIso] || 'ZZ', cb = ISO2[b.countryIso] || 'ZZ';
        return ca !== cb ? ca.localeCompare(cb) : a.city.localeCompare(b.city);
      });

      // Country name lookup (human-readable for group headers)
      const COUNTRY_NAMES = {
        AL:'Albania',DZ:'Algeria',AO:'Angola',AZ:'Azerbaijan',AR:'Argentina',AU:'Australia',
        AT:'Austria',BS:'Bahamas',BH:'Bahrain',BD:'Bangladesh',AM:'Armenia',BE:'Belgium',
        BO:'Bolivia',BR:'Brazil',BG:'Bulgaria',MM:'Myanmar',KH:'Cambodia',CM:'Cameroon',
        CA:'Canada',LK:'Sri Lanka',CL:'Chile',CN:'China',TW:'Taiwan',CO:'Colombia',
        CD:'DR Congo',CR:'Costa Rica',HR:'Croatia',CU:'Cuba',CZ:'Czech Republic',DK:'Denmark',
        DO:'Dominican Republic',EC:'Ecuador',ET:'Ethiopia',EE:'Estonia',FI:'Finland',
        FR:'France',PF:'French Polynesia',GA:'Gabon',GE:'Georgia',DE:'Germany',GH:'Ghana',
        GR:'Greece',GU:'Guam',GT:'Guatemala',HK:'Hong Kong',HU:'Hungary',IS:'Iceland',
        IN:'India',ID:'Indonesia',IR:'Iran',IQ:'Iraq',IE:'Ireland',IL:'Israel',IT:'Italy',
        JM:'Jamaica',JP:'Japan',KZ:'Kazakhstan',JO:'Jordan',KE:'Kenya',KR:'South Korea',
        KW:'Kuwait',KG:'Kyrgyzstan',LA:'Laos',LB:'Lebanon',LV:'Latvia',LY:'Libya',
        LT:'Lithuania',MO:'Macau',MG:'Madagascar',MW:'Malawi',MY:'Malaysia',MV:'Maldives',
        ML:'Mali',MU:'Mauritius',MX:'Mexico',MA:'Morocco',MZ:'Mozambique',OM:'Oman',
        NA:'Namibia',NP:'Nepal',NL:'Netherlands',NZ:'New Zealand',NG:'Nigeria',NO:'Norway',
        PK:'Pakistan',PA:'Panama',PY:'Paraguay',PE:'Peru',PH:'Philippines',PL:'Poland',
        PT:'Portugal',PR:'Puerto Rico',QA:'Qatar',RO:'Romania',RU:'Russia',RW:'Rwanda',
        SN:'Senegal',RS:'Serbia',SG:'Singapore',VN:'Vietnam',SI:'Slovenia',ZA:'South Africa',
        ZW:'Zimbabwe',ES:'Spain',SE:'Sweden',CH:'Switzerland',TJ:'Tajikistan',TH:'Thailand',
        TG:'Togo',AE:'UAE',TN:'Tunisia',TR:'Turkey',TM:'Turkmenistan',UG:'Uganda',
        UA:'Ukraine',MK:'North Macedonia',EG:'Egypt',GB:'United Kingdom',TZ:'Tanzania',
        US:'United States',BF:'Burkina Faso',UY:'Uruguay',UZ:'Uzbekistan',VE:'Venezuela',
        ZM:'Zambia',
      };

      let selectedId = wrapper.dataset.selected || 'JFK';
      let isOpen = false;

      function buildOption(apt) {
        const f = flag(apt.countryIso);
        return `<div class="hdd-opt" data-id="${apt.id}" data-city="${apt.city}" data-name="${apt.name || ''}" data-flag="${f}">
          <span class="hdd-opt-flag">${f}</span>
          <span class="hdd-opt-body">
            <span class="hdd-opt-iata">${apt.id}</span>
            <span class="hdd-opt-city">${apt.city} — ${apt.name || ''}</span>
          </span>
        </div>`;
      }

      function renderList(query) {
        const q = query.toLowerCase();
        const list = document.getElementById('hdd-list');
        if (!list) return;
        const filtered = sorted.filter(a =>
          !q ||
          a.id.toLowerCase().includes(q) ||
          a.city.toLowerCase().includes(q) ||
          (a.name || '').toLowerCase().includes(q) ||
          (COUNTRY_NAMES[ISO2[a.countryIso]] || '').toLowerCase().includes(q)
        );
        if (!filtered.length) { list.innerHTML = '<div class="hdd-empty">No airports found</div>'; return; }

        // Group by country
        const groups = {};
        filtered.forEach(a => {
          const key = ISO2[a.countryIso] || 'ZZ';
          if (!groups[key]) groups[key] = [];
          groups[key].push(a);
        });

        list.innerHTML = Object.entries(groups).map(([alpha2, apts]) => {
          const f = flag(apts[0].countryIso);
          const cname = COUNTRY_NAMES[alpha2] || alpha2;
          return `<div class="hdd-group">
            <div class="hdd-group-header">${f} ${cname}</div>
            ${apts.map(buildOption).join('')}
          </div>`;
        }).join('');

        // Bind clicks
        list.querySelectorAll('.hdd-opt').forEach(el => {
          if (el.dataset.id === selectedId) el.classList.add('hdd-opt-selected');
          el.addEventListener('click', () => {
            selectedId = el.dataset.id;
            wrapper.dataset.selected = selectedId;
            updateTrigger(el.dataset.flag, el.dataset.id, el.dataset.city);
            closePanel();
          });
        });
      }

      function updateTrigger(f, iata, city) {
        const t = document.getElementById('hdd-trigger');
        if (!t) return;
        t.innerHTML = `<span class="hdd-flag">${f}</span>
          <span class="hdd-iata">${iata}</span>
          <span class="hdd-city">${city}</span>
          <span class="hdd-chevron">▾</span>`;
      }

      function openPanel() {
        const panel = document.getElementById('hdd-panel');
        if (!panel) return;
        isOpen = true;
        panel.style.display = 'block';
        document.getElementById('hdd-search')?.focus();
        // Scroll selected into view
        setTimeout(() => {
          const sel = panel.querySelector('.hdd-opt-selected');
          if (sel) sel.scrollIntoView({ block: 'center' });
        }, 50);
      }

      function closePanel() {
        const panel = document.getElementById('hdd-panel');
        if (panel) panel.style.display = 'none';
        isOpen = false;
      }

      // Render initial HTML
      const initApt = sorted.find(a => a.id === selectedId) || sorted[0];
      const initFlag = flag(initApt?.countryIso);
      wrapper.innerHTML = `
        <div class="hdd" id="hdd">
          <button class="hdd-trigger" id="hdd-trigger" type="button">
            <span class="hdd-flag">${initFlag}</span>
            <span class="hdd-iata">${initApt?.id || 'JFK'}</span>
            <span class="hdd-city">${initApt?.city || 'New York'}</span>
            <span class="hdd-chevron">▾</span>
          </button>
          <div class="hdd-panel" id="hdd-panel" style="display:none">
            <input class="hdd-search" id="hdd-search" type="text" placeholder="Search airport, city, or country…" autocomplete="off">
            <div class="hdd-list" id="hdd-list"></div>
          </div>
        </div>`;

      renderList('');

      document.getElementById('hdd-trigger')?.addEventListener('click', () => {
        isOpen ? closePanel() : openPanel();
      });

      document.getElementById('hdd-search')?.addEventListener('input', e => {
        renderList(e.target.value);
      });

      // Close when clicking outside
      document.addEventListener('click', e => {
        if (isOpen && !document.getElementById('hdd')?.contains(e.target)) closePanel();
      }, { capture: true });
    },

    selectLogo(id, emoji, name) {
      document.querySelectorAll('.logo-opt').forEach(el => el.classList.remove('selected'));
      document.querySelector(`.logo-opt[data-logo="${id}"]`)?.classList.add('selected');
      UI._setText('livery-logo-preview', emoji);
      UI._setText('livery-name-preview', name);
      // Update header logo preview too
      const hl = document.querySelector('.header-logo');
      if (hl) hl.textContent = emoji;
    },

    _startGame() {
      const ceoName    = document.getElementById('input-ceo')?.value.trim()    || 'Alex Rivera';
      const airline    = document.getElementById('input-airline')?.value.trim() || 'SkyHigh Airlines';
      const code       = document.getElementById('input-code')?.value.trim().toUpperCase() || 'SHX';
      const doctrineEl = document.querySelector('.doctrine-card.selected');
      const logoEl     = document.querySelector('.logo-opt.selected');

      if (!ceoName)    { UI.toast('Please enter your CEO name.', 'warning'); return; }
      if (!doctrineEl) { UI.toast('Please select a doctrine.', 'warning'); return; }

      const hubId = document.getElementById('hub-dropdown-wrapper')?.dataset.selected || 'JFK';

      const logoId = logoEl?.dataset.logo || 'EAGLE';
      const logoEmoji = SkyHigh.AIRLINE_LOGOS?.find(l => l.id === logoId)?.emoji || '✈';

      SkyHigh.CoreSim.init({
        ceoName, airlineName: airline, airlineCode: code,
        doctrineId: doctrineEl.dataset.doctrine,
        hubAirportId: hubId,
        logoId,
      });
      // Store logo in state
      SkyHigh.CoreSim.getState().logoId = logoId;
      // Update header logo
      const hl = document.querySelector('.header-logo');
      if (hl) hl.textContent = logoEmoji;

      UI.showScreen('game');
      setTimeout(() => UI._initGame(), 300);
    },

    // ── GAME INIT ─────────────────────────────────────────
    async _initGame() {
      const canvas = document.getElementById('map-canvas');
      await SkyHigh.Renderer.init(canvas);

      SkyHigh.MapEngine.setCountryResolver(SkyHigh.Renderer.getCountryAtPoint.bind(SkyHigh.Renderer));
      SkyHigh.MapEngine.onSelect(UI._handleMapSelect);

      const s = SkyHigh.CoreSim.getState();
      SkyHigh.MapEngine.setOriginAirport(s.hubAirportId);

      const hubAirport = SkyHigh.GeoUtils.getAirport(s.hubAirportId);
      if (hubAirport) SkyHigh.Renderer.setHomeCountry(hubAirport.countryIso);

      // Update logo in header
      const logo = SkyHigh.AIRLINE_LOGOS?.find(l => l.id === s.logoId);
      const hl = document.querySelector('.header-logo');
      if (hl && logo) hl.textContent = logo.emoji;

      // Fly to a better default view — shows all continents, hides Antarctica
      SkyHigh.MapEngine.flyTo(20, 10, 1.1);

      UI._buildPlaneSelector();
      UI.updateHUD();
      UI.showCommandPhase();
      UI._showRoundIntro();

      // Start tutorial for first game
      if (s.tutorialStep === 0) {
        setTimeout(() => UI._startTutorial(), 1200);
      }
    },

    // ── HUD UPDATE ────────────────────────────────────────
    updateHUD() {
      const s = SkyHigh.CoreSim.getState();
      if (!s) return;

      UI._setText('airline-name-display', s.airlineName);
      UI._setText('airline-code-display', s.airlineCode);
      UI._setText('round-num',  `${s.round}`);
      UI._setText('round-of',   '/ 20');
      UI._setText('cash-amount', UI._formatCash(s.cash));

      // In-game date
      UI._setText('game-date-display', SkyHigh.CoreSim.getGameDate());

      // Credits
      UI._setText('credits-amount', s.credits || 0);

      // Star rating
      const stars = SkyHigh.CoreSim.getStarRating();
      const starEl = document.getElementById('star-display');
      if (starEl) {
        starEl.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
        starEl.title = `${stars}-Star Airline`;
      }

      // Stage pill
      const stagePill = document.getElementById('stage-pill');
      if (stagePill) {
        stagePill.textContent = `Stage ${s.stage}`;
        stagePill.className = `stage-pill stage-${s.stage}`;
      }

      // Phase dots
      const phases = ['command', 'crisis', 'result', 'report'];
      phases.forEach((p, i) => {
        const dot = document.getElementById(`phase-dot-${p}`);
        if (!dot) return;
        const idx = phases.indexOf(s.phase.toLowerCase());
        dot.className = `phase-dot ${i < idx ? 'done' : i === idx ? 'active' : ''}`;
      });
      UI._setText('phase-label', s.phase);

      // Competency bars
      UI._updateBar('board',   s.boardConfidence);
      UI._updateBar('safety',  s.safetyShield);
      UI._updateBar('crew',    s.crewLoyalty);
      UI._updateBar('prestige',s.servicePrestige);

      const cashEl = document.getElementById('cash-amount');
      if (cashEl) cashEl.className = `cash-amount ${s.cash < 0 ? 'negative' : ''}`;

      // ATO header — company value chip (cash + estimated asset value)
      const assetVal = (s.cash || 0)
        + ((s.fleet?.length || 0) + (s.leasedFleet?.length || 0)) * 15_000_000
        + (s.routes?.length || 0) * 5_000_000;
      UI._setText('company-value-display', UI._formatCash(assetVal));

      // ATO logo sync in header + left nav
      const logoData = SkyHigh.AIRLINE_LOGOS?.find(l => l.id === s.logoId);
      if (logoData) {
        UI._setText('header-logo-avatar', logoData.emoji);
        UI._setText('lnav-logo-icon', logoData.emoji);
      }

      // ATO star row
      const atoStarEl = document.getElementById('ato-star-row');
      if (atoStarEl) {
        const starsVal = SkyHigh.CoreSim.getStarRating();
        atoStarEl.textContent = '★'.repeat(starsVal) + '☆'.repeat(5 - starsVal);
      }

      // Update live game ticker
      UI._updateGameTicker();
    },

    _updateBar(name, value) {
      const fill = document.getElementById(`bar-${name}`);
      const val  = document.getElementById(`val-${name}`);
      if (fill) fill.style.width = `${value}%`;
      if (val)  val.textContent  = value;
    },

    // ── COMMAND PHASE ─────────────────────────────────────
    showCommandPhase() {
      const s = SkyHigh.CoreSim.getState();
      // Ensure sidebar is visible on first game load (not collapsed)
      const sidebar = document.getElementById('sidebar');
      if (sidebar && !sidebar.classList.contains('collapsed')) sidebar.style.display = '';

      const apContainer = document.getElementById('ap-dots');
      if (apContainer) {
        apContainer.innerHTML = Array.from({length:3}).map((_,i) =>
          `<div class="ap-dot ${i < s.actionPoints ? 'filled' : ''}"></div>`
        ).join('');
      }
      UI.switchSidebarTab('overview');
      UI._renderOverviewStats();
      UI._renderAt3RouteList();
      UI._renderAt3FleetList();
      UI._updateNewsTickerMessages();

      // Update FAB badges
      const routeBadge = document.getElementById('fab-route-badge');
      if (routeBadge) routeBadge.textContent = s.routes.length;
      const fleetBadge = document.getElementById('fab-fleet-badge');
      if (fleetBadge) fleetBadge.textContent = (s.fleet?.length || 0) + (s.leasedFleet?.length || 0);
      // Left nav events badge
      const evBadge = document.getElementById('lnav-events-badge');
      if (evBadge) evBadge.textContent = (s.activeWorldEvents?.length || 0) > 0 ? s.activeWorldEvents.length : '';
    },

    _renderRouteList() {
      const s = SkyHigh.CoreSim.getState();
      const container = document.getElementById('route-list');
      if (!container) return;

      if (!s.routes.length) {
        container.innerHTML = `<div class="text-sec" style="text-align:center;padding:1rem;font-size:0.8rem;">No active routes.<br>Click airports on the map to create routes.</div>`;
        return;
      }

      container.innerHTML = s.routes.map(r => {
        const profitText = r.lastProfit === 0 ? '—' : UI._formatCash(r.lastProfit);
        const cls = r.lastProfit > 0 ? 'positive' : r.lastProfit < 0 ? 'negative' : 'idle';
        const typeIcon = r.routeType === 'CARGO' ? '📦' : '👥';
        return `<div class="route-item" data-route="${r.id}">
          <div class="route-airports">
            ${typeIcon} ${r.originId} <span class="route-arrow">→</span> ${r.destId}
          </div>
          <div style="font-size:0.7rem;color:var(--text-muted)">${r.distBand} · ${r.flightsPerWeek || 7}×/wk</div>
          <div class="route-profit ${cls}">${profitText}</div>
          <button class="btn btn-ghost btn-sm" onclick="SkyHigh.UI.closeRoutePrompt('${r.id}')">✕</button>
        </div>`;
      }).join('');
    },

    _renderFleetList() {
      const s = SkyHigh.CoreSim.getState();
      const container = document.getElementById('fleet-list');
      if (!container) return;

      const allFleet = [...s.fleet, ...(s.leasedFleet || [])];
      const planeCount = {};
      allFleet.forEach(f => { planeCount[f.planeId] = (planeCount[f.planeId] || 0) + 1; });

      const queueHTML = (s.deliveryQueue || []).length
        ? `<div style="font-size:0.72rem;color:var(--warning);margin-top:0.3rem">📦 ${s.deliveryQueue.length} plane(s) en route</div>`
        : '';

      container.innerHTML = (Object.entries(planeCount).map(([id, count]) => {
        const p = SkyHigh.PLANES.find(pl => pl.id === id);
        return p ? `<div class="text-sec" style="font-size:0.8rem;padding:0.25rem 0">${p.emoji} ${p.shortName} × ${count}</div>` : '';
      }).join('') || `<div class="text-sec" style="font-size:0.8rem">No fleet yet</div>`) + queueHTML;
    },

    closeRoutePrompt(routeId) {
      if (confirm(`Close this route? This uses 1 action point.`)) {
        const result = SkyHigh.CoreSim.closeRoute(routeId);
        if (result.ok) {
          UI.toast('Route closed.', 'info');
          UI.updateHUD();
          UI._renderRouteList();
        } else {
          UI.toast(result.reason, 'error');
        }
      }
    },

    // ── SIDEBAR TAB SWITCHING ─────────────────────────────
    switchSidebarTab(tabId) {
      document.querySelectorAll('.at3-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tabId);
      });
      document.querySelectorAll('.at3-tab-content').forEach(c => {
        c.classList.toggle('active', c.id === `tab-${tabId}`);
      });
      // Sync left nav active highlight
      document.querySelectorAll('.lnav-item[data-panel]').forEach(item => {
        item.classList.toggle('active', item.dataset.panel === tabId);
      });
      // Update sidebar header title (replaces the removed tab bar)
      const tabTitles = { overview: 'Overview', routes: 'Routes', fleet: 'Fleet', finance: 'Finance', events: 'World Events' };
      UI._setText('sidebar-current-tab-name', tabTitles[tabId] || tabId);
      // If sidebar is collapsed, expand it so user sees the tab they clicked
      const sidebar = document.getElementById('sidebar');
      if (sidebar?.classList.contains('collapsed')) UI.toggleSidebar();

      if (tabId === 'routes')   UI._renderAt3RouteList();
      if (tabId === 'fleet')    UI._renderAt3FleetList();
      if (tabId === 'finance')  UI._renderFinanceTab();
      if (tabId === 'events')   UI._renderEventsTab();
      if (tabId === 'overview') UI._renderOverviewStats();
    },

    _renderOverviewStats() {
      const s = SkyHigh.CoreSim.getState();
      if (!s) return;
      UI._setText('overview-net', s.netThisRound ? UI._formatCash(s.netThisRound) : '—');
      UI._setText('overview-routes', s.routes.length);
      UI._setText('overview-fleet', (s.fleet.length + (s.leasedFleet||[]).length));
      const debtEl = document.getElementById('overview-debt');
      if (debtEl) {
        debtEl.textContent = UI._formatCash(s.totalDebt || 0);
        debtEl.className = `at3-stat-val ${(s.totalDebt||0) > 0 ? 'warning' : ''}`;
      }
      const netEl = document.getElementById('overview-net');
      if (netEl && s.netThisRound !== 0) {
        netEl.className = `at3-stat-val ${s.netThisRound >= 0 ? 'positive' : 'negative'}`;
      }

      // ── Customer Loyalty widget ───────────────────────────
      const loyaltyEl = document.getElementById('overview-loyalty-section');
      if (loyaltyEl) {
        const loyaltyInfo = SkyHigh.CoreSim.getCustomerLoyaltyInfo?.() || { loyalty: 50, label: 'Baseline', color: '#F39C12' };
        const pct = loyaltyInfo.loyalty;
        loyaltyEl.innerHTML = `
          <div class="overview-loyalty-header">
            <span class="overview-loyalty-label">Customer Loyalty</span>
            <span class="overview-loyalty-pct" style="color:${loyaltyInfo.color}">${pct}%</span>
          </div>
          <div class="overview-loyalty-bar-track">
            <div class="overview-loyalty-bar-fill" style="width:${pct}%;background:${loyaltyInfo.color}"></div>
          </div>
          <div class="overview-loyalty-tier" style="color:${loyaltyInfo.color}">${loyaltyInfo.label}</div>
          <div class="overview-loyalty-desc">${pct >= 65 ? '🛡 Demand shocks are cushioned' : pct >= 50 ? '⚡ Baseline demand sensitivity' : '⚠️ Higher exposure to demand swings'}</div>
        `;
      }

      // ── Cascade Cards panel ───────────────────────────────
      const cardsEl = document.getElementById('overview-cascade-cards');
      if (cardsEl) {
        const cards = SkyHigh.CoreSim.getCascadeCards?.() || [];
        if (!cards.length) {
          cardsEl.innerHTML = '<div class="cascade-empty">No board decisions have unlocked cascade cards yet.</div>';
        } else {
          cardsEl.innerHTML = cards.map(cardId => {
            const card = SkyHigh.CASCADE_CARDS?.[cardId];
            if (!card) return '';
            const isPenalty = ['AGING_OPERATIONS','ANTI_ENVIRONMENT','CARGO_DIVESTED','GOVERNMENT_BOARD_CARD'].includes(cardId);
            return `<div class="cascade-card-chip ${isPenalty ? 'penalty' : 'benefit'}">
              <span class="cascade-chip-icon">${card.icon}</span>
              <div class="cascade-chip-body">
                <div class="cascade-chip-name">${card.name}</div>
                <div class="cascade-chip-desc">${card.desc}</div>
              </div>
            </div>`;
          }).join('');
        }
      }
    },

    _renderAt3RouteList() {
      const s = SkyHigh.CoreSim.getState();
      const container = document.getElementById('route-list');
      if (!container) return;
      const badge = document.getElementById('route-count-badge');
      if (badge) badge.textContent = s.routes.length;
      if (!s.routes.length) {
        container.innerHTML = '<div class="at3-empty-state">No routes yet. Click airports on the map to open routes.</div>';
        return;
      }
      container.innerHTML = s.routes.map(r => {
        const cls = r.lastProfit > 0 ? 'profitable' : r.lastProfit < 0 ? 'loss' : 'new';
        const profitCls = r.lastProfit > 0 ? 'positive' : r.lastProfit < 0 ? 'negative' : 'idle';
        const profitText = r.lastProfit === 0
          ? '<span title="Revenue is calculated when you click End Quarter" style="color:#8A8AAA;font-size:0.72rem;cursor:help">⏳ Awaiting Q-End</span>'
          : UI._formatCash(r.lastProfit);
        const typeCls = r.routeType === 'CARGO' ? 'cargo' : 'pax';
        const typeLabel = r.routeType === 'CARGO' ? 'CARGO' : 'PAX';
        return `<div class="at3-route-row" data-route="${r.id}">
          <div class="at3-route-status ${cls}"></div>
          <div class="at3-route-airports">${r.originId} → ${r.destId}</div>
          <div class="at3-route-meta">
            <span class="at3-route-profit ${profitCls}">${profitText}</span>
            <span class="at3-route-type-tag ${typeCls}">${typeLabel}</span>
          </div>
          <button style="background:none;border:none;color:#5A5870;cursor:pointer;font-size:0.75rem;padding:0 0 0 0.3rem" onclick="SkyHigh.UI.closeRoutePrompt('${r.id}')">✕</button>
        </div>`;
      }).join('');
    },

    _renderAt3FleetList() {
      const s = SkyHigh.CoreSim.getState();
      const main = document.getElementById('fleet-list-main');
      const queueEl = document.getElementById('delivery-queue-tab');
      if (!main) return;

      const allFleet = [...(s.fleet||[]), ...(s.leasedFleet||[])];
      if (!allFleet.length) {
        main.innerHTML = '<div class="at3-empty-state">No planes in fleet.</div>';
      } else {
        main.innerHTML = allFleet.map(f => {
          const p = SkyHigh.PLANES.find(pl => pl.id === f.planeId);
          const name = p?.shortName || f.planeId;
          const assigned = f.assignedRoute ? f.assignedRoute : null;
          const statusCls = f.leased ? 'lease' : assigned ? 'assigned' : 'idle';
          const statusTxt = f.leased ? 'LEASED' : assigned ? 'ACTIVE' : 'IDLE';
          return `<div class="at3-fleet-row">
            <div class="at3-fleet-plane-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 2L11 13M22 2L15 22l-4-9-9-4 19-7z"/></svg>
            </div>
            <div class="at3-fleet-info">
              <div class="at3-fleet-name">${f.name}</div>
              <div class="at3-fleet-type">${name}</div>
            </div>
            <div class="at3-fleet-status ${statusCls}">${statusTxt}</div>
          </div>`;
        }).join('');
      }

      if (queueEl) {
        const q = s.deliveryQueue || [];
        if (!q.length) {
          queueEl.innerHTML = '<div class="at3-empty-state">No pending deliveries.</div>';
        } else {
          queueEl.innerHTML = q.map(d => {
            const p = SkyHigh.PLANES.find(pl => pl.id === d.planeType);
            const qtrsLeft = d.deliveryRound - s.round;
            return `<div class="at3-delivery-row">
              <div class="at3-delivery-icon">✈</div>
              <div class="at3-delivery-info">
                <div class="at3-delivery-name">${p?.shortName || d.planeType}</div>
                <div class="at3-delivery-eta">${qtrsLeft > 0 ? `${qtrsLeft} qtr(s) remaining` : 'Arriving next quarter'}</div>
              </div>
              ${s.credits >= 2 ? `<button class="at3-pill-btn" onclick="SkyHigh.UI.skipDeliveryInModal('${d.id}')">⚡ Skip</button>` : ''}
            </div>`;
          }).join('');
        }
      }
    },

    _renderFinanceTab() {
      const s = SkyHigh.CoreSim.getState();
      if (!s) return;
      const fin = SkyHigh.CoreSim.getFinanceSummary();

      // Header cells
      UI._setText('fin-bank-rate', `${(fin.bankRate * 100).toFixed(1)}%`);
      const ratingEl = document.getElementById('fin-credit-rating');
      if (ratingEl) {
        ratingEl.textContent = fin.creditRating;
        ratingEl.style.color = fin.ratingColor;
      }
      UI._setText('fin-total-debt', UI._formatCash(fin.totalDebt));
      const debtEl = document.getElementById('fin-total-debt');
      if (debtEl) debtEl.className = `at3-finance-val ${fin.totalDebt > 0 ? 'danger' : ''}`;

      // Loans list
      const loansEl = document.getElementById('fin-loans-list');
      if (loansEl) {
        if (!fin.loans.length) {
          loansEl.innerHTML = '<div class="at3-empty-state">No active loans. Use financing to grow faster.</div>';
        } else {
          loansEl.innerHTML = fin.loans.map(l => {
            const pctPaid = Math.max(0, Math.min(100, (1 - l.outstanding / l.principal) * 100));
            return `<div class="at3-loan-card">
              <div class="at3-loan-card-header">
                <span class="at3-loan-card-name">${l.name}</span>
                <span class="at3-loan-card-rate">${(l.interestRate * 100).toFixed(2)}%</span>
              </div>
              <div class="at3-loan-bar-track">
                <div class="at3-loan-bar-fill" style="width:${pctPaid}%"></div>
              </div>
              <div class="at3-loan-card-footer">
                <span>Outstanding: ${UI._formatCash(l.outstanding)}</span>
                <span>${l.remainingQtrs} qtrs left</span>
                <span>Qtr: ${UI._formatCash(l.quarterlyPayment)}</span>
              </div>
            </div>`;
          }).join('');
        }
      }

      // Fuel status
      const currentPrice = (SkyHigh.ECONOMY.fuelPriceBase * s.fuelPriceMultiplier).toFixed(4);
      UI._setText('fin-fuel-litres', s.fuelReserves > 0 ? `${(s.fuelReserves/1e6).toFixed(2)}M L` : '0 L');
      UI._setText('fin-fuel-price', s.fuelReserves > 0 ? `$${s.fuelReservePrice.toFixed(4)}/L` : '—');
      UI._setText('fin-market-price', `$${currentPrice}/L`);
      const savingEl = document.getElementById('fin-fuel-saving');
      if (savingEl) {
        if (s.fuelReserves > 0 && s.fuelReservePrice < parseFloat(currentPrice)) {
          const saving = ((1 - s.fuelReservePrice / parseFloat(currentPrice)) * 100).toFixed(1);
          savingEl.textContent = `−${saving}%`;
          savingEl.className = 'at3-fuel-val positive';
        } else if (s.fuelReserves > 0 && s.fuelReservePrice >= parseFloat(currentPrice)) {
          const loss = ((s.fuelReservePrice / parseFloat(currentPrice) - 1) * 100).toFixed(1);
          savingEl.textContent = `+${loss}% (overpaid)`;
          savingEl.className = 'at3-fuel-val negative';
        } else {
          savingEl.textContent = '—';
          savingEl.className = 'at3-fuel-val';
        }
      }

      // Quarter obligations
      UI._setText('fin-qtr-payment', UI._formatCash(fin.totalQtrPayment));
      UI._setText('fin-qtr-interest', UI._formatCash(fin.totalInterestQtr));
    },

    _renderEventsTab() {
      const s = SkyHigh.CoreSim.getState();
      if (!s) return;

      // Active events
      const activeEl = document.getElementById('events-active-list');
      if (activeEl) {
        if (!s.activeWorldEvents || !s.activeWorldEvents.length) {
          activeEl.innerHTML = '<div class="at3-empty-state">No active events this quarter.</div>';
        } else {
          activeEl.innerHTML = s.activeWorldEvents.map(ev => {
            const evData = SkyHigh.WORLD_EVENTS?.find(e => e.id === ev.eventId);
            const type   = evData?.type || 'ECONOMIC';
            const impacts = [];
            if (ev.demandMod !== 1) impacts.push(`<span class="at3-impact-tag ${ev.demandMod > 1 ? 'up' : 'down'}">PAX ${ev.demandMod > 1 ? '▲' : '▼'}${Math.abs(Math.round((ev.demandMod-1)*100))}%</span>`);
            if (ev.bizMod !== 1)   impacts.push(`<span class="at3-impact-tag ${ev.bizMod > 1 ? 'up' : 'down'}">BIZ ${ev.bizMod > 1 ? '▲' : '▼'}${Math.abs(Math.round((ev.bizMod-1)*100))}%</span>`);
            if (ev.cargoMod !== 1) impacts.push(`<span class="at3-impact-tag ${ev.cargoMod > 1 ? 'up' : 'down'}">CARGO ${ev.cargoMod > 1 ? '▲' : '▼'}${Math.abs(Math.round((ev.cargoMod-1)*100))}%</span>`);
            if (ev.fuelMod !== 1)  impacts.push(`<span class="at3-impact-tag fuel">FUEL ${ev.fuelMod > 1 ? '▲' : '▼'}${Math.abs(Math.round((ev.fuelMod-1)*100))}%</span>`);
            return `<div class="at3-event-card ${type}">
              <div class="at3-event-head">
                <span class="at3-event-name">${ev.icon || '🌐'} ${ev.name}</span>
                <span class="at3-event-qtrs">${ev.roundsRemaining} qtr${ev.roundsRemaining !== 1 ? 's' : ''} left</span>
              </div>
              <div class="at3-event-desc">${ev.desc || ''}</div>
              <div class="at3-event-impacts">${impacts.join('')}</div>
            </div>`;
          }).join('');
        }
      }

      // Upcoming events
      const upcomingEl = document.getElementById('events-upcoming-list');
      if (upcomingEl) {
        const upcoming = (SkyHigh.WORLD_EVENTS || []).filter(ev =>
          ev.triggerRound > s.round &&
          ev.triggerRound <= s.round + 3 &&
          !s.worldEventHistory.includes(ev.id)
        );
        upcomingEl.innerHTML = upcoming.length ? upcoming.map(ev => `
          <div class="at3-event-card ${ev.type}" style="opacity:0.6">
            <div class="at3-event-head">
              <span class="at3-event-name">${ev.icon} ${ev.name}</span>
              <span class="at3-event-qtrs">in ${ev.triggerRound - s.round} qtr${ev.triggerRound - s.round !== 1 ? 's' : ''}</span>
            </div>
          </div>`).join('') : '<div class="at3-empty-state">No events in the next 3 quarters.</div>';
      }
    },

    // ── LOAN MODAL ────────────────────────────────────────
    showLoanModal() {
      let selectedTypeId = 'EQUIPMENT';
      let selectedTerm   = 8;

      const grid = document.getElementById('loan-type-grid');
      if (grid) {
        grid.innerHTML = SkyHigh.FINANCING.loanTypes.map(t => `
          <div class="at3-loan-type-card ${t.id === selectedTypeId ? 'selected' : ''}"
               data-type="${t.id}"
               onclick="SkyHigh.UI._selectLoanType('${t.id}')">
            <div class="at3-loan-type-icon">${t.icon}</div>
            <div class="at3-loan-type-name">${t.name}</div>
            <div class="at3-loan-type-desc">${t.desc}</div>
          </div>`).join('');
      }
      UI._updateLoanTerms(selectedTypeId, selectedTerm);
      UI._updateLoanPreview();
      document.getElementById('modal-loan-backdrop')?.classList.add('open');
    },

    _selectLoanType(typeId) {
      document.querySelectorAll('.at3-loan-type-card').forEach(c =>
        c.classList.toggle('selected', c.dataset.type === typeId));
      const t = SkyHigh.FINANCING.loanTypes.find(x => x.id === typeId);
      UI._updateLoanTerms(typeId, t?.termOptions[0] || 8);
      UI._updateLoanPreview();
    },

    _updateLoanTerms(typeId, selectedTerm) {
      const t = SkyHigh.FINANCING.loanTypes.find(x => x.id === typeId);
      const container = document.getElementById('loan-term-opts');
      if (!container || !t) return;
      container.innerHTML = t.termOptions.map(qtr =>
        `<button class="at3-term-pill ${qtr === selectedTerm ? 'selected' : ''}"
                 onclick="SkyHigh.UI._selectLoanTerm(${qtr})">${qtr}Q</button>`
      ).join('');
    },

    _selectLoanTerm(qtrs) {
      document.querySelectorAll('.at3-term-pill').forEach(p =>
        p.classList.toggle('selected', parseInt(p.textContent) === qtrs));
      UI._updateLoanPreview();
    },

    _updateLoanPreview() {
      const s     = SkyHigh.CoreSim.getState();
      if (!s) return;
      const typeCard = document.querySelector('.at3-loan-type-card.selected');
      const termPill = document.querySelector('.at3-term-pill.selected');
      const amtInput = document.getElementById('loan-amount-input');
      if (!typeCard || !termPill || !amtInput) return;

      const typeId  = typeCard.dataset.type;
      const termQtr = parseInt(termPill.textContent);
      const amtM    = parseFloat(amtInput.value) || 0;
      const amount  = amtM * 1e6;

      const loanType = SkyHigh.FINANCING.loanTypes.find(t => t.id === typeId);
      const rating   = SkyHigh.FINANCING.creditRatings.find(r => r.id === s.creditRating)
                     || SkyHigh.FINANCING.creditRatings[2];
      const interestRate = Math.max(0.005, s.currentBankRate + rating.spread + (loanType?.spreadBonus || 0));
      const qRate    = interestRate / 4;
      const qPayment = amount > 0 ? amount * (qRate * Math.pow(1 + qRate, termQtr)) /
                      (Math.pow(1 + qRate, termQtr) - 1) : 0;
      const total    = qPayment * termQtr;

      UI._setText('lp-rate', `${(interestRate * 100).toFixed(2)}%`);
      UI._setText('lp-payment', amount > 0 ? UI._formatCash(qPayment) : '—');
      UI._setText('lp-total',   amount > 0 ? UI._formatCash(total) : '—');
      const ratingEl = document.getElementById('lp-rating');
      if (ratingEl) { ratingEl.textContent = rating.id; ratingEl.style.color = rating.color; }
    },

    confirmLoan() {
      const typeCard = document.querySelector('.at3-loan-type-card.selected');
      const termPill = document.querySelector('.at3-term-pill.selected');
      const amtInput = document.getElementById('loan-amount-input');
      if (!typeCard || !termPill || !amtInput) return;
      const typeId = typeCard.dataset.type;
      const term   = parseInt(termPill.textContent);
      const amount = parseFloat(amtInput.value || 0) * 1e6;
      if (amount <= 0) { UI.toast('Enter a valid amount.', 'warning'); return; }
      const result = SkyHigh.CoreSim.takeLoan(typeId, amount, term);
      if (result.ok) {
        UI.closeLoanModal();
        UI.toast(`Loan of ${UI._formatCash(amount)} approved at ${(result.interestRate*100).toFixed(2)}%. Qtr payment: ${UI._formatCash(result.quarterlyPayment)}.`, 'success');
        UI.updateHUD();
        UI._renderFinanceTab();
        UI._renderOverviewStats();
      } else {
        UI.toast(result.reason, 'error');
      }
    },

    closeLoanModal() {
      document.getElementById('modal-loan-backdrop')?.classList.remove('open');
    },

    // ── FUEL PURCHASE MODAL ───────────────────────────────
    showFuelModal() {
      const s = SkyHigh.CoreSim.getState();
      if (!s) return;
      const currentPrice = SkyHigh.ECONOMY.fuelPriceBase * s.fuelPriceMultiplier;
      const infoEl = document.getElementById('fuel-market-info');
      if (infoEl) {
        infoEl.innerHTML = `
          <div style="display:flex;justify-content:space-between;margin-bottom:0.4rem">
            <span>Market Price</span>
            <span style="font-family:var(--font-data);font-weight:700;color:var(--accent)">$${currentPrice.toFixed(4)}/L</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:0.4rem">
            <span>Current Reserves</span>
            <span style="font-family:var(--font-data);color:var(--text)">${(s.fuelReserves/1e6).toFixed(2)}M L</span>
          </div>
          <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.5rem;line-height:1.5">
            Buying in bulk locks in today's price. If oil prices rise, you save money. If they fall, you overpay — so timing matters.
          </div>`;
      }
      const tierList = document.getElementById('fuel-tier-list');
      if (tierList) {
        tierList.innerHTML = SkyHigh.FINANCING.fuelBulkTiers.map(tier => {
          const discPrice = currentPrice * (1 - tier.discountPct);
          const totalCost = tier.litres * discPrice;
          const canAfford = s.cash >= totalCost;
          return `<div class="at3-fuel-tier ${canAfford ? '' : 'at3-fuel-tier--disabled'}"
                       onclick="${canAfford ? `SkyHigh.UI._confirmFuelPurchase('${tier.id}')` : ''}">
            <div class="at3-fuel-tier-info">
              <div class="at3-fuel-tier-label">${tier.label}</div>
              <div class="at3-fuel-tier-sub">Locked at $${discPrice.toFixed(4)}/L</div>
            </div>
            <div class="at3-fuel-tier-price">
              <div class="at3-fuel-tier-cost">${UI._formatCash(totalCost)}</div>
              <div class="at3-fuel-tier-discount">−${(tier.discountPct*100).toFixed(0)}% bulk discount</div>
            </div>
          </div>`;
        }).join('');
      }
      document.getElementById('modal-fuel-backdrop')?.classList.add('open');
    },

    _confirmFuelPurchase(tierId) {
      const result = SkyHigh.CoreSim.bulkBuyFuel(tierId);
      if (result.ok) {
        UI.closeFuelModal();
        UI.toast(`Bought ${(result.litres/1e6).toFixed(1)}M litres at $${parseFloat(result.pricePer).toFixed(4)}/L (${(result.discountPct*100).toFixed(0)}% discount).`, 'success');
        UI.updateHUD();
        UI._renderFinanceTab();
      } else {
        UI.toast(result.reason, 'error');
      }
    },

    closeFuelModal() {
      document.getElementById('modal-fuel-backdrop')?.classList.remove('open');
    },

    // ── ACTION BUTTONS ────────────────────────────────────
    _bindGameControls() {
      document.getElementById('btn-end-command')?.addEventListener('click', UI._endCommand);
      document.getElementById('btn-buy-plane')?.addEventListener('click', () => UI._showBuyPlaneModal());
      document.getElementById('btn-buy-plane-fleet')?.addEventListener('click', () => UI._showBuyPlaneModal());
      document.getElementById('btn-facilities')?.addEventListener('click', UI._showFacilitiesSelectModal);

      document.getElementById('btn-invest-safety')?.addEventListener('click', () => {
        const btn = document.getElementById('btn-invest-safety');
        if (btn.dataset.confirming === 'true') {
          const r = SkyHigh.CoreSim.investInSafety();
          if (r.ok) {
            UI.toast('Safety investment complete. +8 Shield.', 'success');
            UI.updateHUD();
          } else {
            UI.toast(r.reason, 'error');
          }
          btn.dataset.confirming = 'false';
          btn.querySelector('span:first-of-type').textContent = 'Safety';
          btn.style.borderColor = '';
        } else {
          btn.dataset.confirming = 'true';
          btn.querySelector('span:first-of-type').textContent = 'Confirm?';
          btn.style.borderColor = '#C8933A';
          setTimeout(() => {
            if (btn.dataset.confirming === 'true') {
              btn.dataset.confirming = 'false';
              btn.querySelector('span:first-of-type').textContent = 'Safety';
              btn.style.borderColor = '';
            }
          }, 3000);
        }
      });

      document.getElementById('btn-train-crew')?.addEventListener('click', () => {
        const btn = document.getElementById('btn-train-crew');
        if (btn.dataset.confirming === 'true') {
          const r = SkyHigh.CoreSim.investInCrewTraining();
          if (r.ok) {
            UI.toast('Crew training complete. +10 Loyalty.', 'success');
            UI.updateHUD();
          } else {
            UI.toast(r.reason, 'error');
          }
          btn.dataset.confirming = 'false';
          btn.querySelector('span:first-of-type').textContent = 'Crew';
          btn.style.borderColor = '';
        } else {
          btn.dataset.confirming = 'true';
          btn.querySelector('span:first-of-type').textContent = 'Confirm?';
          btn.style.borderColor = '#C8933A';
          setTimeout(() => {
            if (btn.dataset.confirming === 'true') {
              btn.dataset.confirming = 'false';
              btn.querySelector('span:first-of-type').textContent = 'Crew';
              btn.style.borderColor = '';
            }
          }, 3000);
        }
      });

      document.getElementById('btn-marketing')?.addEventListener('click', () => {
        const btn = document.getElementById('btn-marketing');
        if (btn.dataset.confirming === 'true') {
          const r = SkyHigh.CoreSim.runMarketingCampaign('Global');
          if (r.ok) {
            UI.toast('Marketing launched. +15% demand for 2 qtrs.', 'success');
            UI.updateHUD();
          } else {
            UI.toast(r.reason, 'error');
          }
          btn.dataset.confirming = 'false';
          btn.querySelector('span:first-of-type').textContent = 'Campaign';
          btn.style.borderColor = '';
        } else {
          btn.dataset.confirming = 'true';
          btn.querySelector('span:first-of-type').textContent = 'Confirm?';
          btn.style.borderColor = '#C8933A';
          setTimeout(() => {
            if (btn.dataset.confirming === 'true') {
              btn.dataset.confirming = 'false';
              btn.querySelector('span:first-of-type').textContent = 'Campaign';
              btn.style.borderColor = '';
            }
          }, 3000);
        }
      });

      document.getElementById('btn-clear-route')?.addEventListener('click', () => {
        SkyHigh.MapEngine.clearRoute();
        projState = { flightsPerWeek: 7, fareMultiplier: 1.0, routeType: 'PAX', bizClass: false };
        document.getElementById('route-projection')?.classList.remove('visible');
      });

      document.getElementById('btn-confirm-route')?.addEventListener('click', UI._confirmRoute);
      document.getElementById('btn-reset-view')?.addEventListener('click', () => SkyHigh.MapEngine.resetView());
      document.getElementById('btn-result-next')?.addEventListener('click', () => {
        document.getElementById('result-overlay')?.classList.remove('visible');
        UI._showReportPhase();
      });
      document.getElementById('btn-report-next')?.addEventListener('click', UI.advanceFromReport);
      document.getElementById('btn-play-again')?.addEventListener('click', () => UI.showScreen('setup'));
    },

    _showFacilitiesSelectModal() {
      const s = SkyHigh.CoreSim.getState();
      // Use hub airport for facilities
      UI.showFacilitiesModal(s.hubAirportId);
    },

    // ── FACILITY MODAL ────────────────────────────────────
    showFacilitiesModal(airportId) {
      const airport = SkyHigh.GeoUtils.getAirport(airportId);
      const s       = SkyHigh.CoreSim.getState();
      if (!airport) return;

      UI._setText('facilities-airport-name', `${airport.name} (${airportId})`);

      const installed = s.facilities?.[airportId] || [];
      const container = document.getElementById('facilities-list');
      if (!container) return;

      container.innerHTML = (SkyHigh.AIRPORT_FACILITIES || []).map(fac => {
        const owned    = installed.includes(fac.id);
        const canAfford = s.cash >= fac.costM * 1_000_000;
        return `<div class="facility-card ${owned ? 'owned' : ''}">
          <div class="facility-header">
            <span class="facility-emoji">${fac.emoji}</span>
            <div class="facility-info">
              <div class="facility-name">${fac.name}</div>
              <div class="facility-desc">${fac.desc}</div>
            </div>
            <div class="facility-costs">
              <div style="font-weight:700;color:var(--accent)">${owned ? 'Owned' : '$' + fac.costM + 'M'}</div>
              <div style="font-size:0.7rem;color:var(--text-muted)">${owned ? '$' + (fac.monthlyCostM * 3).toFixed(2) + 'M/qtr' : 'Monthly: $' + (fac.monthlyCostM * 3).toFixed(2) + 'M/qtr'}</div>
            </div>
          </div>
          ${owned ? '' : `<button class="btn btn-sm ${canAfford ? 'btn-primary' : 'btn-ghost'} btn-full" ${!canAfford ? 'disabled' : ''} onclick="SkyHigh.UI.buyFacility('${airportId}','${fac.id}')">Build</button>`}
        </div>`;
      }).join('');

      document.getElementById('modal-facilities-backdrop')?.classList.add('open');
    },

    buyFacility(airportId, facilityId) {
      const r = SkyHigh.CoreSim.purchaseFacility(airportId, facilityId);
      if (r.ok) {
        const fac = SkyHigh.AIRPORT_FACILITIES?.find(f => f.id === facilityId);
        UI.toast(`${fac?.emoji} ${fac?.name} built at ${airportId}!`, 'success');
        document.getElementById('modal-facilities-backdrop')?.classList.remove('open');
        UI.updateHUD();
      } else {
        UI.toast(r.reason, 'error');
      }
    },

    _endCommand() {
      // Guide: first time End Quarter is clicked
      if (!_endQuarterClickedOnce) {
        _endQuarterClickedOnce = true;
        UI._advanceGuide('beforeEndQuarter');
      }
      const result = SkyHigh.CoreSim.endCommandPhase();
      if (!result.ok) return;
      UI.updateHUD();

      if (result.crisis?.type === 'NONE') {
        setTimeout(() => UI._runResultPhase(), 500);
      } else if (result.crisis?.type === 'BOSS') {
        UI._showCrisisModal(result.crisis.crisis, true);
      } else {
        UI._showCrisisModal(result.crisis.crisis);
      }
    },

    // ── CRISIS MODAL ──────────────────────────────────────
    _showCrisisModal(crisis, isBoss = false) {
      if (!crisis) { UI._runResultPhase(); return; }

      // Runway crisis uses its own dedicated risk-calculator modal
      if (crisis.isRunwayCrisis) {
        SkyHigh.Renderer.setCrisisMode(true);
        UI.updateHUD();
        UI._showRunwayCrisisModal(crisis);
        return;
      }

      SkyHigh.Renderer.setCrisisMode(true);
      UI.updateHUD();

      const backdrop = document.getElementById('modal-crisis-backdrop');
      const modal    = document.getElementById('modal-crisis');
      if (!backdrop || !modal) return;

      const phaseContainer = document.getElementById('boss-phases');
      if (isBoss && crisis.phases) {
        phaseContainer.style.display = 'flex';
        phaseContainer.innerHTML = crisis.phases.map((_, i) =>
          `<div class="boss-phase-dot ${i === 0 ? 'active' : ''}" id="boss-dot-${i}"></div>`
        ).join('');
      } else {
        phaseContainer.style.display = 'none';
      }

      UI._updateCrisisModalContent(crisis, isBoss);
      backdrop.classList.add('open');
      if (isBoss) modal.classList.add('boss-event');
      else modal.classList.remove('boss-event');
    },

    _updateCrisisModalContent(crisis, isBoss) {
      const s = SkyHigh.CoreSim.getState();
      const currentPhase = isBoss ? crisis.phases[s.currentBossPhase] : null;

      UI._setText('crisis-icon', crisis.icon || '⚠️');
      UI._setText('crisis-name', isBoss && currentPhase ? `${crisis.name} — ${currentPhase.title}` : crisis.name);
      UI._setText('crisis-severity', crisis.severity);
      UI._setText('crisis-teaser', crisis.teaser);
      UI._setText('crisis-desc', isBoss && currentPhase ? currentPhase.desc : crisis.description);

      const choices = isBoss ? (currentPhase?.choices || []) : (crisis.decisions || []);
      const container = document.getElementById('crisis-choices');
      if (!container) return;

      container.innerHTML = choices.map(choice => {
        const effectTags = Object.entries(choice.effects || {})
          .filter(([k]) => k !== 'pendingCrisis')
          .map(([k, v]) => {
            if (typeof v !== 'number') return '';
            const cls   = v > 0 ? 'positive' : 'negative';
            const label = UI._effectLabel(k, v);
            return `<span class="effect-tag ${cls}">${label}</span>`;
          }).filter(Boolean).join('');

        return `<div class="crisis-choice" onclick="SkyHigh.UI.resolveCrisis('${choice.id}')">
          <div class="crisis-choice-label">
            <span class="crisis-choice-id">${choice.id.replace(/[0-9]/g,'')}</span>
            ${choice.label}
          </div>
          <div class="crisis-choice-desc">${choice.desc}</div>
          ${effectTags ? `<div class="crisis-effects">${effectTags}</div>` : ''}
        </div>`;
      }).join('');
    },

    _effectLabel(key, val) {
      const prefix = val > 0 ? '+' : '';
      const labels = {
        cash:            `${prefix}$${Math.abs(val) >= 1e6 ? (val/1e6).toFixed(1)+'M' : val.toLocaleString()}`,
        boardConfidence: `Board ${prefix}${val}`,
        safetyShield:    `Safety ${prefix}${val}`,
        crewLoyalty:     `Crew ${prefix}${val}`,
        servicePrestige: `Prestige ${prefix}${val}`,
        demandMult:      `Demand ×${val.toFixed(2)}`,
        fareMult:        `Fares ×${val.toFixed(2)}`,
        customerCare:    `Care ${prefix}${val}`,
      };
      return labels[key] || `${key} ${prefix}${val}`;
    },

    resolveCrisis(decisionId) {
      // Capture runway flag before resolution clears it
      const prevState  = SkyHigh.CoreSim.getState();
      const isRunway   = prevState.activeCrisis?.isRunwayCrisis === true;

      const result = SkyHigh.CoreSim.resolveCrisis(decisionId);
      if (!result.ok) return;

      const s = SkyHigh.CoreSim.getState();

      if (!result.bossComplete) {
        // More phases remain
        if (isRunway) {
          // Advance runway modal to next phase
          UI._updateRunwayCrisisModal(s.activeCrisis);
        } else {
          const crisis   = s.activeCrisis;
          const phaseIdx = s.currentBossPhase;
          const dots = document.querySelectorAll('.boss-phase-dot');
          dots.forEach((d, i) => {
            d.className = `boss-phase-dot ${i < phaseIdx ? 'done' : i === phaseIdx ? 'active' : ''}`;
          });
          UI._updateCrisisModalContent(crisis, true);
        }
      } else {
        // All phases resolved
        if (isRunway) {
          document.getElementById('modal-runway-backdrop')?.classList.remove('open');
          SkyHigh.Renderer.setCrisisMode(false);
          UI.updateHUD();
          // Guide: after first crisis in rounds 1-5
          const sNow = SkyHigh.CoreSim.getState();
          if (sNow.round <= 5) UI._advanceGuide('afterFirstCrisis');
          // Reveal hidden customer care score before proceeding
          setTimeout(() => UI._showCareReveal(), 450);
        } else {
          document.getElementById('modal-crisis-backdrop')?.classList.remove('open');
          document.getElementById('modal-crisis')?.classList.remove('boss-event');
          SkyHigh.Renderer.setCrisisMode(false);
          UI.updateHUD();
          // Guide: after first crisis in rounds 1-5
          const sNow = SkyHigh.CoreSim.getState();
          if (sNow.round <= 5) UI._advanceGuide('afterFirstCrisis');
          setTimeout(() => UI._runResultPhase(), 500);
        }
      }
    },

    // ── RUNWAY CRISIS MODAL ───────────────────────────────
    _showRunwayCrisisModal(crisis) {
      const s = SkyHigh.CoreSim.getState();
      const phaseData = crisis.phases[s.currentBossPhase];

      // Set phase title
      UI._setText('runway-phase-title', phaseData?.title || crisis.name);

      // Render body
      UI._renderRunwayPhaseBody(crisis, phaseData, s);

      document.getElementById('modal-runway-backdrop')?.classList.add('open');

      // Start countdown timer (decorative — 90s)
      UI._startRunwayTimer(90);
    },

    _updateRunwayCrisisModal(crisis) {
      const s = SkyHigh.CoreSim.getState();
      const phaseData = crisis.phases[s.currentBossPhase];
      UI._setText('runway-phase-title', phaseData?.title || crisis.name);
      UI._renderRunwayPhaseBody(crisis, phaseData, s);
    },

    _startRunwayTimer(seconds) {
      const el = document.getElementById('runway-timer');
      if (!el) return;
      let remaining = seconds;
      el.textContent = `${remaining}s`;
      if (UI._runwayTimerInterval) clearInterval(UI._runwayTimerInterval);
      UI._runwayTimerInterval = setInterval(() => {
        remaining--;
        if (el) el.textContent = `${remaining}s`;
        if (remaining <= 0) {
          clearInterval(UI._runwayTimerInterval);
          UI._runwayTimerInterval = null;
        }
      }, 1000);
    },

    _renderRunwayPhaseBody(crisis, phaseData, s) {
      const body = document.getElementById('runway-modal-body');
      if (!body || !phaseData) return;

      // ── Phase 1 — Operational Decision (risk calculator) ──
      if (phaseData.isRunwayPhase) {
        const activeEventsHtml = (s.activeWorldEvents || []).map(ev => {
          const evData = SkyHigh.WORLD_EVENTS?.find(e => e.id === ev.eventId);
          return evData ? `<span class="runway-ev-tag">${evData.icon || '🌐'} ${evData.name}</span>` : '';
        }).filter(Boolean).join('');

        body.innerHTML = `
          <div class="runway-situation-box">
            <div class="runway-situation-label">⚠ SITUATION BRIEFING</div>
            <p style="margin:0.4rem 0 0.2rem;font-size:0.82rem;color:#1E1A26;line-height:1.5">${crisis.teaser}</p>
            <p style="margin:0.6rem 0 0;font-size:0.8rem;color:#4A4560;line-height:1.5">${crisis.description || ''}</p>
            ${activeEventsHtml ? `<div style="margin-top:0.5rem;display:flex;gap:0.3rem;flex-wrap:wrap">${activeEventsHtml}</div>` : ''}
          </div>
          <div class="runway-risk-header">
            <span class="runway-risk-label">RISK ASSESSMENT — Choose your action</span>
          </div>
          <div class="runway-choices">
            ${phaseData.choices.map(c => UI._buildRunwayRiskOption(c)).join('')}
          </div>
          <div class="runway-calc-row">
            <div class="runway-calc-cell">
              <div class="runway-calc-label">Current Safety Shield</div>
              <div class="runway-calc-val ${s.safetyShield >= 60 ? 'good' : s.safetyShield >= 30 ? 'warn' : 'danger'}">${s.safetyShield}</div>
            </div>
            <div class="runway-calc-cell">
              <div class="runway-calc-label">Active World Events</div>
              <div class="runway-calc-val warn">${s.activeWorldEvents?.length || 0}</div>
            </div>
            <div class="runway-calc-cell">
              <div class="runway-calc-label">Board Confidence</div>
              <div class="runway-calc-val ${s.boardConfidence >= 60 ? 'good' : 'warn'}">${s.boardConfidence}</div>
            </div>
          </div>`;

      // ── Phase 2 — Passenger Communication ──
      } else if (phaseData.phase === 2) {
        body.innerHTML = `
          <div class="runway-situation-box" style="border-left-color:#F39C12">
            <div class="runway-situation-label" style="color:#F39C12">📢 PASSENGER COMMUNICATION</div>
            <p style="margin:0.4rem 0 0;font-size:0.82rem;color:#1E1A26;line-height:1.5">
              Hundreds of passengers are on board — or stranded at the gate. They are confused, anxious, and increasingly upset. How does your airline communicate?
            </p>
            <p style="font-size:0.78rem;color:#5A5870;margin:0.4rem 0 0">
              <em>Note: Your Customer Care score is being assessed — they're watching how you handle this.</em>
            </p>
          </div>
          <div class="runway-risk-header">
            <span class="runway-risk-label">SELECT COMMUNICATION APPROACH</span>
          </div>
          <div class="runway-choices">
            ${phaseData.choices.map(c => UI._buildRunwayCommOption(c)).join('')}
          </div>`;

      // ── Phase 3 — Customer Recovery ──
      } else if (phaseData.isRecoveryPhase) {
        body.innerHTML = `
          <div class="runway-situation-box" style="border-left-color:#27AE60">
            <div class="runway-situation-label" style="color:#27AE60">🤝 CUSTOMER RECOVERY</div>
            <p style="margin:0.4rem 0 0;font-size:0.82rem;color:#1E1A26;line-height:1.5">
              The airspace closure has now been communicated. Passengers have been deplaned or are being rebooked. This is your airline's moment to decide how to make things right.
            </p>
            <p style="font-size:0.78rem;color:#5A5870;margin:0.4rem 0 0">
              <em>Your Customer Care score will be revealed after this decision.</em>
            </p>
          </div>
          <div class="runway-risk-header">
            <span class="runway-risk-label">RECOVERY ACTION</span>
          </div>
          <div class="runway-choices">
            ${phaseData.choices.map(c => UI._buildRunwayRecoveryOption(c)).join('')}
          </div>`;

      // ── Fallback ──
      } else {
        body.innerHTML = `
          <div class="runway-choices">
            ${(phaseData.choices || []).map(c => UI._buildRunwayRiskOption(c)).join('')}
          </div>`;
      }
    },

    _buildRunwayRiskOption(choice) {
      const riskColors = { CRITICAL: '#C0392B', MEDIUM: '#E67E22', LOW: '#27AE60' };
      const riskColor  = riskColors[choice.risk] || '#5A5870';
      const effectTags = Object.entries(choice.effects || {})
        .filter(([k, v]) => typeof v === 'number' && k !== 'pendingCrisis')
        .map(([k, v]) => {
          const cls   = v > 0 ? 'positive' : 'negative';
          return `<span class="effect-tag ${cls}">${UI._effectLabel(k, v)}</span>`;
        }).join('');

      const riskDescMap = {
        CRITICAL: 'High risk — regulatory, financial, reputational exposure',
        MEDIUM:   'Moderate risk — operational disruption, crew fatigue',
        LOW:      'Conservative choice — delays but protected position',
      };

      return `<div class="runway-risk-option ${choice.risk || ''}" onclick="SkyHigh.UI.resolveCrisis('${choice.id}')">
        <div class="runway-option-top">
          <span class="runway-option-id">${choice.id.replace(/_/g,' ')}</span>
          ${choice.risk ? `<span class="runway-risk-pill" style="background:${riskColor}15;color:${riskColor};border:1px solid ${riskColor}40">${choice.risk} RISK</span>` : ''}
        </div>
        <div class="runway-option-risk-desc" style="color:${riskColor};font-size:0.74rem;margin:0.2rem 0 0.35rem">${riskDescMap[choice.risk] || ''}</div>
        ${effectTags ? `<div class="runway-option-effects">${effectTags}</div>` : ''}
      </div>`;
    },

    _buildRunwayCommOption(choice) {
      const labelMap = {
        HONEST_CALM:  { label: 'Honest & Calm', quote: '"We are experiencing an airspace closure order. We will keep you fully informed as the situation develops."', note: 'Transparent, measured tone. Passengers appreciate truth.' },
        VAGUE_POLITE: { label: 'Vague & Polite', quote: '"We apologize for the inconvenience. There is an operational delay. We will update you shortly."', note: 'Avoids details. Some passengers may remain calm; others frustrated.' },
        NO_UPDATE:    { label: 'No Update Given', quote: '(Silence. No announcement made.)', note: 'Passengers left in the dark — anger escalates rapidly.' },
      };
      const m = labelMap[choice.id] || { label: choice.id.replace(/_/g,' '), quote: '', note: '' };
      const effectTags = Object.entries(choice.effects || {})
        .filter(([k, v]) => typeof v === 'number')
        .map(([k, v]) => `<span class="effect-tag ${v > 0 ? 'positive' : 'negative'}">${UI._effectLabel(k, v)}</span>`)
        .join('');

      return `<div class="runway-comm-option" onclick="SkyHigh.UI.resolveCrisis('${choice.id}')">
        <div class="runway-comm-label">${m.label}</div>
        <div class="runway-comm-quote">${m.quote}</div>
        <div class="runway-comm-note">${m.note}</div>
        ${effectTags ? `<div class="runway-option-effects" style="margin-top:0.4rem">${effectTags}</div>` : ''}
      </div>`;
    },

    _buildRunwayRecoveryOption(choice) {
      const dataMap = {
        PREMIUM_CARE:    { label: 'Premium Care Package', icon: '🌟', desc: 'Full refund + hotel + meal vouchers + priority rebooking + personal apology letter from CEO.' },
        STANDARD_REFUND: { label: 'Standard Refund',      icon: '✅', desc: 'Full refund + rebooking assistance per standard policy. No extras.' },
        POLICY_ONLY:     { label: 'Policy Only',           icon: '📋', desc: 'Minimum obligations per contract of carriage. No additional compensation offered.' },
      };
      const m = dataMap[choice.id] || { label: choice.id.replace(/_/g,' '), icon: '•', desc: '' };
      const cashEffect = choice.effects?.cash;
      const effectTags = Object.entries(choice.effects || {})
        .filter(([k, v]) => typeof v === 'number')
        .map(([k, v]) => `<span class="effect-tag ${v > 0 ? 'positive' : 'negative'}">${UI._effectLabel(k, v)}</span>`)
        .join('');

      return `<div class="runway-recovery-option" onclick="SkyHigh.UI.resolveCrisis('${choice.id}')">
        <div class="runway-recovery-top">
          <span class="runway-recovery-icon">${m.icon}</span>
          <span class="runway-recovery-label">${m.label}</span>
          ${cashEffect ? `<span class="runway-recovery-cost">${UI._formatCash(cashEffect)}</span>` : ''}
        </div>
        <div class="runway-recovery-desc">${m.desc}</div>
        ${effectTags ? `<div class="runway-option-effects" style="margin-top:0.4rem">${effectTags}</div>` : ''}
      </div>`;
    },

    // ── CUSTOMER CARE REVEAL ──────────────────────────────
    _showCareReveal() {
      const outcome = SkyHigh.CoreSim.resolveCustomerCareOutcome?.();
      if (!outcome) { UI._runResultPhase(); return; }

      const { score, tier, extraEffects } = outcome;

      // Populate modal
      const scoreEl = document.getElementById('care-reveal-score');
      const barEl   = document.getElementById('care-reveal-bar');
      const tierEl  = document.getElementById('care-reveal-tier');
      const descEl  = document.getElementById('care-reveal-desc');
      const fxEl    = document.getElementById('care-reveal-effects');

      const tierData = {
        EXCELLENT: { label: 'Excellent Customer Care',  color: '#27AE60', cls: 'excellent', desc: 'Your airline went above and beyond. Passengers are sharing positive experiences — this builds long-term loyalty and brand equity.' },
        ADEQUATE:  { label: 'Adequate Response',        color: '#F39C12', cls: 'adequate',  desc: 'You met the minimum standard. Passengers are not delighted, but most frustrations have been addressed. Room to improve.' },
        POOR:      { label: 'Poor Customer Care',       color: '#E67E22', cls: 'poor',      desc: 'The response fell short. Multiple passengers are voicing complaints online. Reputation has taken a hit.' },
        CRISIS:    { label: 'Customer Care Failure',    color: '#C0392B', cls: 'poor',      desc: 'The airline\'s response was widely criticized. Passengers feel abandoned — social media backlash is significant.' },
      };
      const td = tierData[tier] || tierData.ADEQUATE;

      if (scoreEl) {
        scoreEl.textContent   = score;
        scoreEl.className     = `care-reveal-score ${td.cls}`;
        scoreEl.style.color   = td.color;
      }
      if (barEl) {
        barEl.style.width      = `${score}%`;
        barEl.style.background = td.color;
      }
      if (tierEl) { tierEl.textContent = td.label; tierEl.style.color = td.color; }
      if (descEl) descEl.textContent = td.desc;
      if (fxEl) {
        const tags = Object.entries(extraEffects || {})
          .filter(([k, v]) => typeof v === 'number')
          .map(([k, v]) => `<span class="effect-tag ${v > 0 ? 'positive' : 'negative'}">${UI._effectLabel(k, v)}</span>`)
          .join('');
        fxEl.innerHTML = tags || '<span style="font-size:0.8rem;color:#5A5870">No additional effects</span>';
      }

      document.getElementById('modal-care-reveal-backdrop')?.classList.add('open');
    },

    _closeCareReveal() {
      document.getElementById('modal-care-reveal-backdrop')?.classList.remove('open');
      setTimeout(() => UI._runResultPhase(), 300);
    },

    // ── RESULT PHASE ──────────────────────────────────────
    _runResultPhase() {
      SkyHigh.CoreSim.getState().phase = 'RESULT';
      const results = SkyHigh.CoreSim.endCrisisPhase();
      UI.updateHUD();
      if (!results.ok) return;

      const overlay = document.getElementById('result-overlay');
      if (overlay) {
        overlay.classList.add('visible');
        UI._setText('result-net-display', `${results.net >= 0 ? '+' : ''}${UI._formatCash(results.net)}`);
        const netEl = document.getElementById('result-net-display');
        if (netEl) netEl.className = `result-net ${results.net >= 0 ? 'positive' : 'negative'}`;
        UI._setText('result-revenue-display',  UI._formatCash(results.totalRevenue));
        UI._setText('result-expenses-display', UI._formatCash(results.totalExpenses));
        UI._setText('result-cash-display',     UI._formatCash(SkyHigh.CoreSim.getState().cash));

        const canvas = document.getElementById('map-canvas');
        if (canvas) {
          results.routeResults?.forEach(r => {
            const route   = SkyHigh.CoreSim.getState().routes.find(rt => rt.id === r.routeId);
            if (!route) return;
            const airport = SkyHigh.GeoUtils.getAirport(route.originId);
            if (!airport) return;
            const pos = SkyHigh.MapEngine.project(airport.lat, airport.lon);
            SkyHigh.Renderer.spawnDelta(r.profit, pos.x, pos.y);
          });
        }
      }
    },

    // ── REPORT PHASE ──────────────────────────────────────
    _showReportPhase() {
      SkyHigh.CoreSim.endResultPhase();
      const s          = SkyHigh.CoreSim.getState();
      const boardQuote = SkyHigh.CoreSim.getBoardReaction();
      const topRoutes  = SkyHigh.CoreSim.getTopRoutes(5);
      const headline   = SkyHigh.HEADLINES[s.round] || `Quarter ${s.round} Complete`;

      UI.updateHUD();

      const reportOverlay = document.getElementById('report-overlay');
      if (!reportOverlay) return;

      UI._setText('report-episode',   `Quarter ${s.round} · Stage ${s.stage} · ${SkyHigh.CoreSim.getGameDate()}`);
      UI._setText('report-headline',  headline);
      UI._setText('report-board-quote', boardQuote);

      const tickerEl = document.getElementById('report-ticker-text');
      if (tickerEl) {
        const msgs = [];
        if (s.netThisRound >= 0) msgs.push(`Revenue Q${s.round}: ${UI._formatCash(s.revenue)}`);
        topRoutes.forEach(r => msgs.push(`${r.originId}→${r.destId}: ${UI._formatCash(r.lastProfit)}/qtr`));
        tickerEl.textContent = msgs.join(' ● ');
      }

      const routesTable = document.getElementById('report-routes-table');
      if (routesTable) {
        routesTable.innerHTML = topRoutes.map((r, i) => {
          const cls = r.lastProfit >= 0 ? 'positive' : 'negative';
          return `<div class="route-item stagger-item" style="animation-delay:${i*0.08}s">
            <span class="text-mono text-muted" style="width:20px">#${i+1}</span>
            <div class="route-airports">${r.originId} → ${r.destId}</div>
            <div style="font-size:0.72rem;color:var(--text-muted)">${r.distBand}</div>
            <div class="route-profit ${cls}">${UI._formatCash(r.lastProfit)}</div>
          </div>`;
        }).join('');
      }

      reportOverlay.classList.add('visible');
    },

    advanceFromReport() {
      document.getElementById('report-overlay')?.classList.remove('visible');
      const result = SkyHigh.CoreSim.endReportPhase();
      // Auto-save after each quarter (local + cloud)
      UI.saveGame();
      if (SkyHigh.Auth?.isLoggedIn?.()) {
        SkyHigh.Auth.cloudSave(SkyHigh.CoreSim.getState()).catch(() => {});
      }

      if (result.gameOver) {
        UI._showEndGame(result.legacyTitle);
      } else {
        // Show delivered planes notification
        if (result.delivered?.length > 0) {
          result.delivered.forEach(d => {
            const p = SkyHigh.PLANES.find(pl => pl.id === d.planeType);
            UI.toast(`${p?.emoji || '✈'} ${p?.shortName || d.planeType} delivered to fleet!`, 'success');
          });
        }
        // Bonus cash notification
        if (result.bonusCash > 0) {
          UI.toast(`💰 Early-mover bonus: +${UI._formatCash(result.bonusCash)}!`, 'success', 5000);
        }
        UI.updateHUD();
        UI.showCommandPhase();
        UI._showRoundIntro();
      }
    },

    // ── END GAME ──────────────────────────────────────────
    _showEndGame(legacyTitle) {
      const s = SkyHigh.CoreSim.getState();
      UI.showScreen('endgame');
      UI._setText('end-legacy-title', legacyTitle?.title || 'Steady Operator');
      UI._setText('end-ceo-name',  s.ceoName);
      UI._setText('end-airline',   s.airlineName);
      UI._setText('end-cash',      UI._formatCash(s.cash));
      UI._setText('end-routes',    s.routes.length.toString());
      UI._setText('end-crises',    s.crisisCount.toString());
    },

    // ── MAP INTERACTION ───────────────────────────────────
    _bindMapEvents() {
      const container = document.getElementById('map-container');
      if (!container) return;
      container.style.cursor = 'default';

      // Click only — no drag, no zoom
      let touchStartX = 0, touchStartY = 0, touchMoved = false;

      container.addEventListener('mousedown', e => {
        if (e.target.closest('[data-no-map-click]')) return;
        // just track position for click detection
        e._clickX = e.clientX;
        e._clickY = e.clientY;
      });

      container.addEventListener('click', e => {
        if (e.target.closest('[data-no-map-click]')) return;
        const rect = container.getBoundingClientRect();
        UI._onMapClick(e.clientX - rect.left, e.clientY - rect.top);
      });

      container.addEventListener('mousemove', e => {
        const rect = container.getBoundingClientRect();
        SkyHigh.MapEngine.handlePointerMove(e.clientX - rect.left, e.clientY - rect.top);
        const hoverLabel = document.getElementById('map-hover-label');
        if (hoverLabel) {
          const sel = SkyHigh.MapEngine.getSelection();
          if (sel.hoveredAirport) {
            hoverLabel.textContent = `${sel.hoveredAirport.name} (${sel.hoveredAirport.id})`;
            hoverLabel.style.display = 'block';
          } else if (sel.hoveredCountry) {
            hoverLabel.textContent = `${sel.hoveredCountry.emoji || '🌍'} ${sel.hoveredCountry.name}`;
            hoverLabel.style.display = 'block';
          } else {
            hoverLabel.style.display = 'none';
          }
        }
      });

      container.addEventListener('mouseleave', () => {
        const hoverLabel = document.getElementById('map-hover-label');
        if (hoverLabel) hoverLabel.style.display = 'none';
      });

      // Touch: single tap only (no pinch, no drag)
      container.addEventListener('touchstart', e => {
        if (e.touches.length === 1) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
          touchMoved = false;
        }
      }, { passive: true });

      container.addEventListener('touchmove', e => {
        if (e.touches.length === 1) {
          const dx = e.touches[0].clientX - touchStartX;
          const dy = e.touches[0].clientY - touchStartY;
          if (Math.abs(dx) > 8 || Math.abs(dy) > 8) touchMoved = true;
        }
      }, { passive: true });

      container.addEventListener('touchend', e => {
        if (!touchMoved && e.changedTouches.length === 1) {
          const rect = container.getBoundingClientRect();
          UI._onMapClick(e.changedTouches[0].clientX - rect.left, e.changedTouches[0].clientY - rect.top);
        }
      });

      // Prevent scroll propagation from the route projection panel
      document.getElementById('route-projection')?.addEventListener('wheel', e => e.stopPropagation());
    },

    _handleMapSelect(type, data) {
      if (type === 'AIRPORT')  UI._showAirportOverlay(data);
      else if (type === 'COUNTRY') UI._showCountryOverlay(data);
      else UI._hideOverlayCard();
    },

    _onMapClick(px, py) { SkyHigh.MapEngine.handleClick(px, py); },

    // ── OVERLAY CARDS ─────────────────────────────────────
    _showAirportOverlay(airport) {
      UI._hideOverlayCard();
      const s = SkyHigh.CoreSim.getState();
      if (!s) return;

      const pos    = SkyHigh.MapEngine.project(airport.lat, airport.lon);
      const isHub  = s.hubAirportId === airport.id;
      const routes = s.routes.filter(r => r.originId === airport.id || r.destId === airport.id);
      const level  = Math.max(1, airport.hubLevel);
      const levelLabel = `LV.${level}`;

      // Demand split
      const bizDemand  = Math.round(airport.demand * 0.22);
      const tourDemand = Math.round(airport.demand * 0.78);

      const card = document.createElement('div');
      card.className = 'map-overlay-card';
      card.id = 'active-overlay';

      const mapEl = document.getElementById('map-container');
      const mapW  = mapEl ? mapEl.clientWidth  : window.innerWidth;
      const mapH  = mapEl ? mapEl.clientHeight : window.innerHeight;
      const FAB_CLEAR = 110; // FABs are ~90px wide + 20px margin from right edge
      const x = Math.max(10, Math.min(pos.x + 15, mapW - 320 - FAB_CLEAR));
      const y = Math.max(10, Math.min(pos.y - 20,  mapH - 340));
      card.style.left = `${x}px`;
      card.style.top  = `${y}px`;

      const hubBadge = isHub ? ' <span class="airport-hub-badge">HOME HUB ⭐</span>' : '';
      const actionBtn = isHub
        ? `<button class="btn btn-primary btn-sm btn-full" onclick="SkyHigh.UI._showHangarView('${airport.id}')">✈ View Hangar</button>`
        : `<button class="btn btn-primary btn-sm btn-full" onclick="SkyHigh.UI.openRouteFromHub('${airport.id}')">→ Open Route from Hub</button>`;

      card.innerHTML = `
        <div class="overlay-card-name">${airport.name}${hubBadge}</div>
        <div class="overlay-card-sub">${airport.city} · ${airport.id} · <span class="airport-level-badge">${levelLabel}</span></div>
        <div class="overlay-stat-row">
          <span class="overlay-stat-label">Hub Level</span>
          <span class="overlay-stat-value">${'★'.repeat(airport.hubLevel)}${'☆'.repeat(5-airport.hubLevel)}</span>
        </div>
        <div class="demand-split-row">
          <div class="demand-split-label">Demand Split</div>
          <div class="demand-split-bars">
            <div class="demand-bar-wrap">
              <span class="demand-bar-icon">💼</span>
              <div class="demand-bar-track"><div class="demand-bar-fill biz" style="width:${Math.round(bizDemand/airport.demand*100)}%"></div></div>
              <span class="demand-bar-val">${bizDemand.toLocaleString()}</span>
            </div>
            <div class="demand-bar-wrap">
              <span class="demand-bar-icon">🏖</span>
              <div class="demand-bar-track"><div class="demand-bar-fill tour" style="width:${Math.round(tourDemand/airport.demand*100)}%"></div></div>
              <span class="demand-bar-val">${tourDemand.toLocaleString()}</span>
            </div>
          </div>
        </div>
        <div class="overlay-stat-row">
          <span class="overlay-stat-label">Routes Here</span>
          <span class="overlay-stat-value text-mono">${routes.length}</span>
        </div>
        <div class="overlay-actions" style="margin-top:0.75rem">
          ${actionBtn}
          ${isHub ? `<button class="btn btn-secondary btn-sm btn-full" onclick="SkyHigh.UI.showFacilitiesModal('${airport.id}');SkyHigh.UI._hideOverlayCard()">🏗 Facilities</button>` : ''}
          <button class="btn btn-ghost btn-sm btn-full" onclick="SkyHigh.MapEngine.flyTo(${airport.lat},${airport.lon},4);SkyHigh.UI._hideOverlayCard()">🔍 Zoom In</button>
          <button class="btn btn-ghost btn-sm btn-full" onclick="SkyHigh.UI._hideOverlayCard()">✕ Close</button>
        </div>`;

      document.getElementById('map-container')?.appendChild(card);
      overlay = card;
    },

    _showCountryOverlay(country) {
      UI._hideOverlayCard();
      const s = SkyHigh.CoreSim.getState();
      if (!s) return;

      const hubAirport    = SkyHigh.GeoUtils.getAirport(s.hubAirportId);
      const isHomeCountry = country.iso === hubAirport?.countryIso;
      const airports      = SkyHigh.GeoUtils.getAirportsByCountryIso(country.iso);

      const card = document.createElement('div');
      card.className = 'map-overlay-card country-overlay-card';
      card.id = 'active-overlay';

      const mapEl2 = document.getElementById('map-container');
      const mapW2  = mapEl2 ? mapEl2.clientWidth  : window.innerWidth;
      const mapH2  = mapEl2 ? mapEl2.clientHeight : window.innerHeight;
      const FAB_CLEAR2 = 110; // FABs ~90px + 20px margin
      const cx = country.clickPx ?? mapW2 / 2;
      const cy = country.clickPy ?? mapH2 / 2;
      const x  = Math.max(10, Math.min(cx + 10, mapW2 - 330 - FAB_CLEAR2));
      const y  = Math.max(10, Math.min(cy - 10,  mapH2 - 420));
      card.style.left = `${x}px`;
      card.style.top  = `${y}px`;

      const riskColor = { LOW:'var(--success)', MEDIUM:'var(--warning)', HIGH:'var(--danger)' }[country.risk] || 'var(--text-sec)';
      const tierColor = { PREMIUM:'var(--accent)', HIGH:'var(--primary)', MEDIUM:'var(--text-sec)', LOW:'var(--text-muted)' }[country.tier] || 'var(--text-sec)';

      const airportListHTML = airports.length
        ? airports.map(ap => {
            const isHub = ap.id === s.hubAirportId;
            const btn   = isHub
              ? `<button class="btn btn-primary btn-sm" onclick="SkyHigh.UI._showHangarView('${ap.id}')">✈ Hangar</button>`
              : `<button class="btn btn-secondary btn-sm" onclick="SkyHigh.UI.openRouteFromHub('${ap.id}')">→ Route</button>`;
            return `<div class="country-airport-row">
              <div class="country-airport-info">
                <span class="country-airport-code">${ap.id}</span>
                <span class="country-airport-name">${ap.city} · LV.${ap.hubLevel}</span>
              </div>
              ${btn}
            </div>`;
          }).join('')
        : `<div class="text-muted" style="font-size:0.78rem;text-align:center;padding:0.5rem 0">No airports in dataset</div>`;

      card.innerHTML = `
        <div class="overlay-card-name">${country.emoji || ''} ${country.name} ${isHomeCountry ? '<span class="home-badge">HOME</span>' : ''}</div>
        <div class="overlay-card-sub">${country.region}</div>
        <div class="overlay-stat-row">
          <span class="overlay-stat-label">Risk</span>
          <span style="color:${riskColor};font-weight:600;font-size:0.78rem">${country.risk}</span>
          <span class="overlay-stat-label" style="margin-left:1rem">Market</span>
          <span style="color:${tierColor};font-weight:600;font-size:0.78rem">${country.tier}</span>
        </div>
        <div class="country-airports-section">
          <div class="country-airports-label">AIRPORTS</div>
          ${airportListHTML}
        </div>
        <button class="btn btn-ghost btn-sm btn-full" style="margin-top:0.5rem" onclick="SkyHigh.UI._hideOverlayCard()">✕ Close</button>`;

      document.getElementById('map-container')?.appendChild(card);
      overlay = card;
    },

    // ── HANGAR VIEW ───────────────────────────────────────
    _showHangarView(airportId) {
      UI._hideOverlayCard();
      const s       = SkyHigh.CoreSim.getState();
      const airport = SkyHigh.GeoUtils.getAirport(airportId);
      if (!airport || !s) return;

      const pos    = SkyHigh.MapEngine.project(airport.lat, airport.lon);
      const routes = s.routes.filter(r => r.originId === airportId || r.destId === airportId);
      const allFleet = [...s.fleet, ...(s.leasedFleet || [])];
      const planeCount = {};
      allFleet.forEach(f => { planeCount[f.planeId] = (planeCount[f.planeId] || 0) + 1; });

      const fleetHTML = Object.keys(planeCount).length
        ? Object.entries(planeCount).map(([id, cnt]) => {
            const p = SkyHigh.PLANES?.find(pl => pl.id === id);
            if (!p) return '';
            const lifeInfo = p.lifespanQtrs ? `<span style="font-size:0.65rem;color:var(--text-muted)">${p.lifespanQtrs}qtr life</span>` : '';
            return `<div class="hangar-fleet-row">${p.emoji} ${p.shortName} <span class="hangar-count">×${cnt}</span> ${lifeInfo}</div>`;
          }).join('')
        : `<div class="text-muted" style="font-size:0.78rem">No fleet yet</div>`;

      const deliveryHTML = (s.deliveryQueue || []).length
        ? `<div style="margin-top:0.5rem;font-size:0.75rem;color:var(--warning)">` +
          s.deliveryQueue.map(d => {
            const p = SkyHigh.PLANES?.find(pl => pl.id === d.planeType);
            const eta = d.deliveryRound - s.round;
            return `📦 ${p?.shortName || d.planeType} — arriving in ${eta} qtr${eta !== 1 ? 's' : ''}
              <button class="btn btn-sm btn-ghost" style="padding:2px 6px;font-size:0.65rem;margin-left:4px" onclick="SkyHigh.UI.skipDelivery('${d.id}')">💎 Skip (2)</button>`;
          }).join('<br>') + `</div>` : '';

      const routesHTML = routes.length
        ? routes.map(r => {
            const other = r.originId === airportId ? r.destId : r.originId;
            const arrow = r.originId === airportId ? '→' : '←';
            const cls   = r.lastProfit > 0 ? 'positive' : r.lastProfit < 0 ? 'negative' : '';
            const pText = r.lastProfit ? UI._formatCash(r.lastProfit) + '/qtr' : 'Pending';
            const typeIcon = r.routeType === 'CARGO' ? '📦' : '👥';
            return `<div class="hangar-route-row">
              <span class="hangar-route-airports">${typeIcon} ${airportId} ${arrow} ${other}</span>
              <span class="route-profit ${cls}" style="font-size:0.75rem">${pText}</span>
            </div>`;
          }).join('')
        : `<div class="text-muted" style="font-size:0.78rem">No active routes</div>`;

      const card = document.createElement('div');
      card.className = 'map-overlay-card hangar-card';
      card.id = 'active-overlay';

      const mapElH = document.getElementById('map-container');
      const mapWH  = mapElH ? mapElH.clientWidth  : window.innerWidth;
      const mapHH  = mapElH ? mapElH.clientHeight : window.innerHeight;
      const x = Math.max(10, Math.min(pos.x + 15, mapWH - 350 - 110));
      const y = Math.max(10, Math.min(pos.y - 20,  mapHH - 500));
      card.style.left = `${x}px`;
      card.style.top  = `${y}px`;

      card.innerHTML = `
        <div class="hangar-header">
          <div class="hangar-icon">✈</div>
          <div>
            <div class="overlay-card-name">${airport.name}</div>
            <div class="overlay-card-sub">${airport.city} · ${airport.id} · HOME HUB ⭐</div>
          </div>
        </div>
        <div class="hangar-section">
          <div class="hangar-section-label">FLEET (${allFleet.length} aircraft)</div>
          ${fleetHTML}
          ${deliveryHTML}
        </div>
        <div class="hangar-section">
          <div class="hangar-section-label">ACTIVE ROUTES (${routes.length})</div>
          ${routesHTML}
        </div>
        <div style="margin-top:0.75rem;display:flex;gap:0.4rem;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" style="flex:1" onclick="SkyHigh.UI._showBuyPlaneModal()">✈ Fleet</button>
          <button class="btn btn-secondary btn-sm" style="flex:1" onclick="SkyHigh.UI.showFacilitiesModal('${airport.id}');SkyHigh.UI._hideOverlayCard()">🏗 Facilities</button>
          <button class="btn btn-ghost btn-sm" onclick="SkyHigh.MapEngine.flyTo(${airport.lat},${airport.lon},4);SkyHigh.UI._hideOverlayCard()">🔍</button>
          <button class="btn btn-ghost btn-sm" onclick="SkyHigh.UI._hideOverlayCard()">✕</button>
        </div>`;

      document.getElementById('map-container')?.appendChild(card);
      overlay = card;
    },

    skipDelivery(deliveryId) {
      const r = SkyHigh.CoreSim.skipDelivery(deliveryId);
      if (r.ok) {
        UI.toast('Plane delivered early! 💎 ×2 spent.', 'success');
        UI._hideOverlayCard();
        const s = SkyHigh.CoreSim.getState();
        UI._showHangarView(s.hubAirportId);
        UI.updateHUD();
      } else {
        UI.toast(r.reason, 'error');
      }
    },

    _hideOverlayCard() {
      document.getElementById('active-overlay')?.remove();
      overlay = null;
    },

    // ── ROUTE CREATION ────────────────────────────────────
    openRouteFromHub(destAirportId) {
      UI._hideOverlayCard();
      const s = SkyHigh.CoreSim.getState();
      if (!s) return;
      SkyHigh.MapEngine.setOriginAirport(s.hubAirportId);
      SkyHigh.MapEngine.setDestAirport(destAirportId);
      UI._showRouteProjection();
    },

    // ── ROUTE PROJECTION CONTROLS ─────────────────────────
    setRouteType(type) {
      projState.routeType = type;
      document.getElementById('rtt-pax')?.classList.toggle('active', type === 'PAX');
      document.getElementById('rtt-cargo')?.classList.toggle('active', type === 'CARGO');
      UI._showRouteProjection();
    },

    adjustFlightsPerWeek(delta) {
      projState.flightsPerWeek = Math.max(1, Math.min(14, projState.flightsPerWeek + delta));
      UI._setText('fpw-display', projState.flightsPerWeek);
      UI._showRouteProjection();
    },

    toggleBizClass(val) {
      projState.bizClass = val;
      UI._showRouteProjection();
    },

    onFareSlider(val) {
      projState.fareMultiplier = val / 100;
      UI._setText('fare-pct', `×${projState.fareMultiplier.toFixed(1)}`);
      UI._showRouteProjection();
    },

    _buildPlaneSelector() {
      // Build the plane selector in the projection panel
      const container = document.getElementById('proj-plane-select');
      if (!container) return;

      const s = SkyHigh.CoreSim.getState();
      const available = SkyHigh.PLANES.filter(p => p.unlockRound <= s.round);

      container.innerHTML = available.slice(0, 6).map(p =>
        `<div class="plane-opt ${p.id === selectedPlaneId ? 'selected' : ''}" data-plane="${p.id}" onclick="SkyHigh.UI.selectPlane('${p.id}')">
          <span class="plane-emoji">${p.emoji}</span>
          ${p.shortName}
        </div>`
      ).join('');
    },

    selectPlane(planeId) {
      selectedPlaneId = planeId;
      document.querySelectorAll('.plane-opt').forEach(el => {
        el.classList.toggle('selected', el.dataset.plane === planeId);
      });
      UI._showRouteProjection();
    },

    _showRouteProjection() {
      const sel = SkyHigh.MapEngine.getSelection();
      if (!sel.originAirport || !sel.destAirport) return;
      // Guide: first time projection panel opens
      UI._advanceGuide('routeProjection');

      const proj = SkyHigh.CoreSim.projectRoute(
        sel.originAirport.id, sel.destAirport.id, selectedPlaneId,
        { routeType: projState.routeType, flightsPerWeek: projState.flightsPerWeek, fareMultiplier: projState.fareMultiplier, bizClass: projState.bizClass }
      );
      const panel = document.getElementById('route-projection');
      if (!panel || !proj) return;

      UI._setText('proj-origin', sel.originAirport.id);
      UI._setText('proj-dest',   sel.destAirport.id);
      UI._setText('proj-dist',   `${proj.distKm?.toLocaleString() || '—'} km`);
      UI._setText('proj-band',   proj.distBand || '');
      UI._setText('proj-flighttime', proj.flightTimeH ? `${proj.flightTimeH}h flight` : '—');

      if (proj.feasible) {
        UI._setText('proj-revenue',  UI._formatCash(proj.projectedRevenue));
        UI._setText('proj-cost',     UI._formatCash(proj.projectedCost));
        UI._setText('proj-profit',   UI._formatCash(proj.projectedProfit));
        UI._setText('proj-opencost', `Open: ${UI._formatCash(proj.openCost)}`);

        const profitEl = document.getElementById('proj-profit');
        if (profitEl) profitEl.className = `proj-stat-value ${proj.projectedProfit >= 0 ? 'positive' : 'negative'}`;
        document.getElementById('btn-confirm-route').disabled = false;

        // Seat class bar
        const seatBar = document.getElementById('proj-seat-bar');
        if (seatBar && proj.seatBreakdown) {
          const sb = proj.seatBreakdown;
          const total = sb.economy + sb.business + sb.first;
          const ecoPct = Math.round(sb.economy / total * 100);
          const bizPct = Math.round(sb.business / total * 100);
          const firstPct = 100 - ecoPct - bizPct;
          seatBar.innerHTML = `
            <div class="seat-bar-label">Cabin: <span style="color:var(--text-muted)">${sb.economy}E</span> ${sb.business > 0 ? `<span style="color:var(--primary)">${sb.business}B</span>` : ''} ${sb.first > 0 ? `<span style="color:var(--accent)">${sb.first}F</span>` : ''}</div>
            <div class="seat-bar-track">
              <div class="seat-bar-eco" style="width:${ecoPct}%" title="Economy: ${sb.economy}"></div>
              ${sb.business > 0 ? `<div class="seat-bar-biz" style="width:${bizPct}%" title="Business: ${sb.business}"></div>` : ''}
              ${sb.first > 0 ? `<div class="seat-bar-first" style="width:${firstPct}%" title="First: ${sb.first}"></div>` : ''}
            </div>`;
        }
      } else {
        UI._setText('proj-revenue', '—');
        UI._setText('proj-cost',    '—');
        UI._setText('proj-profit',  proj.reason || 'OUT OF RANGE');
        UI._setText('proj-opencost', '');
        document.getElementById('btn-confirm-route').disabled = true;
      }

      // Sync stepper display
      UI._setText('fpw-display', projState.flightsPerWeek);

      panel.classList.add('visible');
    },

    _confirmRoute() {
      const sel = SkyHigh.MapEngine.getSelection();
      if (!sel.originAirport || !sel.destAirport) return;

      const result = SkyHigh.CoreSim.openRoute(
        sel.originAirport.id, sel.destAirport.id, selectedPlaneId,
        projState.routeType === 'CARGO' ? 'cargo' : 'economy',
        { routeType: projState.routeType, flightsPerWeek: projState.flightsPerWeek, fareMultiplier: projState.fareMultiplier, bizClass: projState.bizClass }
      );

      if (result.ok) {
        // Refresh panel + show success modal
        SkyHigh.MapEngine.clearRoute();
        document.getElementById('route-projection')?.classList.remove('visible');
        projState = { flightsPerWeek: 7, fareMultiplier: 1.0, routeType: 'PAX', bizClass: false };
        UI.updateHUD();
        UI._renderRouteList();
        // Guide: first route opened
        UI._advanceGuide('afterFirstRoute');

        // Show success modal
        const proj = SkyHigh.CoreSim.projectRoute(sel.originAirport.id, sel.destAirport.id, selectedPlaneId);
        UI._showRouteSuccessModal(sel.originAirport, sel.destAirport, result, proj);
      } else {
        UI.toast(result.reason, 'error');
      }
    },

    _showRouteSuccessModal(origin, dest, result, proj) {
      UI._setText('rsc-origin', `${origin.city} (${origin.id})`);
      UI._setText('rsc-dest',   `${dest.city} (${dest.id})`);
      UI._setText('rss-dist',   `${result.distKm?.toLocaleString() || '—'} km`);
      UI._setText('rss-time',   result.flightTimeH ? `${result.flightTimeH}h` : '—');
      UI._setText('rss-profit', proj?.projectedProfit != null ? UI._formatCash(proj.projectedProfit) + '/qtr' : '—');

      // Seat breakdown bar in success modal
      const seatBar = document.getElementById('rss-seat-bar');
      if (seatBar && proj?.seatBreakdown) {
        const sb = proj.seatBreakdown;
        const total = sb.economy + sb.business + sb.first;
        const ecoPct = Math.round(sb.economy / total * 100);
        const bizPct = Math.round(sb.business / total * 100);
        seatBar.innerHTML = `
          <div class="seat-bar-label" style="margin-bottom:4px">Cabin Configuration</div>
          <div class="seat-bar-track" style="height:12px;border-radius:6px">
            <div class="seat-bar-eco"   style="width:${ecoPct}%"></div>
            ${sb.business > 0 ? `<div class="seat-bar-biz" style="width:${bizPct}%"></div>` : ''}
          </div>
          <div style="display:flex;gap:1rem;margin-top:4px;font-size:0.72rem;color:var(--text-muted)">
            <span>E: ${sb.economy}</span>${sb.business > 0 ? `<span>B: ${sb.business}</span>` : ''}${sb.first > 0 ? `<span>F: ${sb.first}</span>` : ''}
          </div>`;
      }

      document.getElementById('modal-route-success-backdrop')?.classList.add('open');
    },

    // ── PLANE MODAL — TABS ────────────────────────────────
    _showBuyPlaneModal(initialTab = 'new') {
      fleetTab = initialTab;
      fleetMfr = 'ALL';
      UI.switchFleetTab(initialTab);
      document.getElementById('modal-buyplane-backdrop')?.classList.add('open');
    },

    switchFleetTab(tab) {
      fleetTab = tab;
      document.querySelectorAll('.fleet-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
      // Manufacturer filter only for new/lease tabs
      const mfrFilter = document.getElementById('mfr-filter');
      if (mfrFilter) mfrFilter.style.display = (tab === 'new' || tab === 'lease') ? 'flex' : 'none';
      UI._renderPlaneModal();
    },

    filterByMfr(mfr) {
      fleetMfr = mfr;
      document.querySelectorAll('.mfr-btn').forEach(b => b.classList.toggle('active', b.dataset.mfr === mfr));
      UI._renderPlaneModal();
    },

    _renderPlaneModal() {
      const s         = SkyHigh.CoreSim.getState();
      const container = document.getElementById('buy-plane-list');
      if (!container) return;

      if (fleetTab === 'queue') {
        UI._renderDeliveryQueue(s, container);
        return;
      }

      let planes = SkyHigh.PLANES;
      if (fleetMfr !== 'ALL') {
        planes = planes.filter(p => p.manufacturer === fleetMfr || (fleetMfr === 'ATR' && (p.manufacturer === 'ATR' || p.manufacturer === 'De Havilland')));
      }

      if (fleetTab === 'used') {
        // Only planes that have been around for 2+ rounds
        planes = planes.filter(p => p.unlockRound <= Math.max(1, s.round - 2));
      }

      container.innerHTML = planes.map(plane => {
        const locked = fleetTab !== 'used' && plane.unlockRound > s.round;
        let costLabel, canAfford, actionBtn;

        if (fleetTab === 'new') {
          const cost = plane.costM * 1_000_000;
          canAfford = s.cash >= cost;
          const deliveryLabel = plane.deliveryQtrs > 0 ? `<span class="delivery-badge">📦 ${plane.deliveryQtrs}qtr delivery</span>` : '<span class="delivery-badge instant">⚡ Instant</span>';
          costLabel = `$${plane.costM}M ${deliveryLabel}`;
          actionBtn = locked ? `<button class="btn btn-ghost btn-sm btn-full" disabled>Locked R${plane.unlockRound}</button>`
            : `<button class="btn btn-primary btn-sm btn-full" ${!canAfford ? 'disabled' : ''} onclick="SkyHigh.UI.buyPlane('${plane.id}')">Buy ${plane.shortName}</button>`;
        } else if (fleetTab === 'lease') {
          const qtrCost = plane.leaseMonthlyCostM * 3;
          canAfford = s.cash >= plane.leaseMonthlyCostM * 3 * 1_000_000;
          costLabel = `$${qtrCost.toFixed(2)}M/qtr`;
          actionBtn = locked ? `<button class="btn btn-ghost btn-sm btn-full" disabled>Locked</button>`
            : `<button class="btn btn-secondary btn-sm btn-full" ${!canAfford ? 'disabled' : ''} onclick="SkyHigh.UI.leasePlane('${plane.id}')">Lease ${plane.shortName}</button>`;
        } else { // used
          const usedCost = Math.round(plane.costM * 0.62);
          canAfford = s.cash >= usedCost * 1_000_000;
          costLabel = `$${usedCost}M (used 40% life)`;
          actionBtn = `<button class="btn btn-secondary btn-sm btn-full" ${!canAfford ? 'disabled' : ''} onclick="SkyHigh.UI.buyUsedPlane('${plane.id}')">Buy Used</button>`;
        }

        const sb = `${plane.economySeats || plane.seats}E${plane.businessSeats ? ' · ' + plane.businessSeats + 'B' : ''}${plane.firstSeats ? ' · ' + plane.firstSeats + 'F' : ''}`;

        return `<div class="plane-card stagger-item ${locked ? 'locked' : ''}">
          <div class="plane-card-header">
            <div class="plane-card-icon">${plane.emoji}</div>
            <div class="plane-card-info">
              <div class="plane-card-name">${plane.name}</div>
              <div class="plane-card-mfr">${plane.manufacturer}</div>
            </div>
            <div class="plane-card-price">${costLabel}</div>
          </div>
          <div class="plane-card-specs">
            <div class="plane-spec"><span class="spec-label">Cabin</span><span class="spec-val">${sb}</span></div>
            <div class="plane-spec"><span class="spec-label">Range</span><span class="spec-val">${plane.rangeKm.toLocaleString()} km</span></div>
            <div class="plane-spec"><span class="spec-label">Speed</span><span class="spec-val">${plane.cruiseKmh} km/h</span></div>
            <div class="plane-spec"><span class="spec-label">Lifespan</span><span class="spec-val">${plane.lifespanQtrs || '—'} qtr</span></div>
          </div>
          <div class="plane-card-strength">${plane.strength}</div>
          <div style="margin-top:0.75rem">${actionBtn}</div>
        </div>`;
      }).join('');
    },

    _renderDeliveryQueue(s, container) {
      const queue = s.deliveryQueue || [];
      if (!queue.length) {
        container.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-muted)">No planes on order.</div>`;
        return;
      }
      container.innerHTML = queue.map(d => {
        const p   = SkyHigh.PLANES.find(pl => pl.id === d.planeType);
        const eta = d.deliveryRound - s.round;
        const canSkip = s.credits >= 2;
        return `<div class="delivery-item">
          <span class="delivery-emoji">${p?.emoji || '✈'}</span>
          <div class="delivery-info">
            <div class="delivery-name">${p?.name || d.planeType}</div>
            <div class="delivery-eta">Arriving in <strong>${eta}</strong> quarter${eta !== 1 ? 's' : ''} · Round ${d.deliveryRound}</div>
          </div>
          <button class="btn btn-sm ${canSkip ? 'btn-primary' : 'btn-ghost'}" ${!canSkip ? 'disabled' : ''} onclick="SkyHigh.UI.skipDeliveryInModal('${d.id}')">💎 Skip (2)</button>
        </div>`;
      }).join('');
    },

    buyPlane(planeId) {
      const result = SkyHigh.CoreSim.buyPlane(planeId);
      if (result.ok) {
        const plane = SkyHigh.PLANES.find(p => p.id === planeId);
        if (result.delivering) {
          UI.toast(`${plane?.emoji} ${plane?.name} ordered! Arrives in ${result.deliveryQtrs} qtr(s).`, 'info', 5000);
        } else {
          UI.toast(`${plane?.emoji} ${plane?.name} added to fleet!`, 'success');
        }
        document.getElementById('modal-buyplane-backdrop')?.classList.remove('open');
        UI.updateHUD();
        UI._renderFleetList();
      } else {
        UI.toast(result.reason, 'error');
      }
    },

    leasePlane(planeId) {
      const result = SkyHigh.CoreSim.leasePlane(planeId);
      if (result.ok) {
        const plane = SkyHigh.PLANES.find(p => p.id === planeId);
        UI.toast(`${plane?.emoji} ${plane?.name} leased! Deposit: ${UI._formatCash(result.deposit)}`, 'success');
        document.getElementById('modal-buyplane-backdrop')?.classList.remove('open');
        UI.updateHUD();
        UI._renderFleetList();
      } else {
        UI.toast(result.reason, 'error');
      }
    },

    buyUsedPlane(planeId) {
      const result = SkyHigh.CoreSim.buyUsedPlane(planeId);
      if (result.ok) {
        const plane = SkyHigh.PLANES.find(p => p.id === planeId);
        UI.toast(`${plane?.emoji} Used ${plane?.shortName} purchased for ${UI._formatCash(result.costSpent)}!`, 'success');
        document.getElementById('modal-buyplane-backdrop')?.classList.remove('open');
        UI.updateHUD();
        UI._renderFleetList();
      } else {
        UI.toast(result.reason, 'error');
      }
    },

    skipDeliveryInModal(deliveryId) {
      const r = SkyHigh.CoreSim.skipDelivery(deliveryId);
      if (r.ok) {
        UI.toast('Delivery skipped! ✈ Plane added to fleet.', 'success');
        UI.updateHUD();
        UI._renderFleetList();
        UI._renderPlaneModal(); // refresh queue tab
      } else {
        UI.toast(r.reason, 'error');
      }
    },

    // ── KEYBOARD SHORTCUTS ────────────────────────────────
    _bindKeyboard() {
      document.addEventListener('keydown', e => {
        if (currentScreen !== 'game') return;
        if (e.key === 'Escape') {
          UI._hideOverlayCard();
          SkyHigh.MapEngine.clearRoute();
          document.getElementById('route-projection')?.classList.remove('visible');
          document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
        }
        if (e.key === 'r' || e.key === 'R') SkyHigh.MapEngine.resetView();
      });
    },

    // ── MODAL CLOSE BINDINGS ──────────────────────────────
    _bindModalClose() {
      document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => {
          document.getElementById(btn.dataset.closeModal)?.classList.remove('open');
        });
      });
      // Click backdrop to close
      document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', e => {
          if (e.target === backdrop) backdrop.classList.remove('open');
        });
      });
      // Wire loan amount input for live preview
      document.getElementById('loan-amount-input')?.addEventListener('input', () => UI._updateLoanPreview());
    },

    // ── SIDEBAR COLLAPSE TOGGLE ───────────────────────────
    toggleSidebar() {
      const sidebar = document.getElementById('sidebar');
      const iconEl  = document.getElementById('sidebar-toggle-icon');
      if (!sidebar) return;
      const isCollapsed = sidebar.classList.toggle('collapsed');
      // Point right (›) when collapsed so user knows clicking will expand
      // Point left (‹) when expanded so user knows clicking will collapse
      if (iconEl) {
        iconEl.setAttribute('d', ''); // clear any path
        iconEl.innerHTML = isCollapsed
          ? '<polyline points="9 18 15 12 9 6"/>'  // › expand
          : '<polyline points="15 18 9 12 15 6"/>'; // ‹ collapse
      }
    },

    // ── PANEL MANAGEMENT ──────────────────────────────────
    _showPanel(id) {
      document.querySelectorAll('.sidebar-panel').forEach(p => {
        p.style.display = 'none';
        p.classList.remove('panel-enter');
      });
      const panel = document.getElementById(id);
      if (panel) {
        panel.style.display = 'block';
        panel.classList.add('panel-enter');
      }
    },

    // ── ROUND INTRO ───────────────────────────────────────
    _showRoundIntro() {
      const s = SkyHigh.CoreSim.getState();
      const banner = document.createElement('div');
      banner.className = 'round-intro-banner';
      banner.innerHTML = `
        <div class="round-intro-label">QUARTER</div>
        <div class="round-intro-num">${s.round}</div>
        <div class="round-intro-date">${SkyHigh.CoreSim.getGameDate()}</div>
        <div class="round-intro-label" style="margin-top:2px;font-size:0.7rem">${SkyHigh.HEADLINES[s.round] || ''}</div>`;
      document.body.appendChild(banner);
      setTimeout(() => banner.remove(), 2800);

      // Guide character: show on round 1
      if (s.round === 1) {
        setTimeout(() => UI._advanceGuide('roundStart1'), 3000);
      } else if (s.round > 5) {
        UI.guideDismiss();
      }
    },

    // ── TUTORIAL SYSTEM ───────────────────────────────────
    _startTutorial() {
      const s = SkyHigh.CoreSim.getState();
      if (s.tutorialStep < 0) return; // already done
      s.tutorialStep = 0;
      UI._showTutorialStep(0);
    },

    _showTutorialStep(idx) {
      const overlay = document.getElementById('tutorial-overlay');
      if (!overlay) return;
      if (idx >= TUTORIAL_STEPS.length) {
        overlay.style.display = 'none';
        SkyHigh.CoreSim.getState().tutorialStep = -1;
        return;
      }
      const step = TUTORIAL_STEPS[idx];
      UI._setText('tutorial-title', step.title);
      UI._setText('tutorial-text',  step.text);
      UI._setText('tutorial-step',  `${idx + 1} / ${TUTORIAL_STEPS.length}`);
      overlay.style.display = 'flex';
    },

    nextTutorialStep() {
      const s = SkyHigh.CoreSim.getState();
      s.tutorialStep = (s.tutorialStep || 0) + 1;
      UI._showTutorialStep(s.tutorialStep);
    },

    skipTutorial() {
      document.getElementById('tutorial-overlay').style.display = 'none';
      SkyHigh.CoreSim.getState().tutorialStep = -1;
    },

    // ── NEWS TICKER ───────────────────────────────────────
    _updateNewsTickerMessages() {
      const s = SkyHigh.CoreSim.getState();
      tickerMessages = [
        `${SkyHigh.CoreSim.getGameDate()} · Q${s.round} — ${SkyHigh.HEADLINES[s.round] || 'New Quarter Begins'}`,
        `Fleet: ${[...s.fleet, ...(s.leasedFleet||[])].length} aircraft · Routes: ${s.routes.length} · 💎 ${s.credits} credits`,
        `Cash: ${UI._formatCash(s.cash)} · Stars: ${'★'.repeat(SkyHigh.CoreSim.getStarRating())}`,
        `Board ${s.boardConfidence} · Safety ${s.safetyShield} · Crew ${s.crewLoyalty} · Prestige ${s.servicePrestige}`,
        ...SkyHigh.MAP_DATA.airports.filter(a => a.hubLevel === 5).slice(0, 3)
          .map(a => `${a.city} (${a.id}): ${a.demand.toLocaleString()} pax/qtr`),
      ];
      UI._setTickerText(tickerMessages[0]);
    },

    _advanceTicker() {
      if (!tickerMessages.length) return;
      tickerIdx = (tickerIdx + 1) % tickerMessages.length;
      UI._setTickerText(tickerMessages[tickerIdx]);
    },

    _setTickerText(text) {
      const el = document.getElementById('ticker-text');
      if (el) el.textContent = text;
    },

    // ── TOAST SYSTEM ─────────────────────────────────────
    toast(message, type = 'info', duration = 4000) {
      const container = document.getElementById('toast-container');
      if (!container) return;
      const icons = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' };
      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span class="toast-text">${message}</span>`;
      container.appendChild(toast);
      setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
      }, duration);
    },

    // ── MILESTONE BANNER ──────────────────────────────────
    showMilestone(milestone) {
      const banner = document.createElement('div');
      banner.className = 'milestone-banner';
      banner.innerHTML = `
        <div style="font-size:2rem">🏅</div>
        <div class="milestone-title">${milestone.title}</div>
        <div style="font-size:0.85rem;color:var(--text-sec);margin-top:0.25rem">${milestone.desc}</div>
        <div style="font-size:0.8rem;color:var(--primary);margin-top:0.5rem">Reward: ${milestone.reward}</div>`;
      document.body.appendChild(banner);
      setTimeout(() => banner.remove(), 4000);
    },

    // ── HELPERS ───────────────────────────────────────────
    _setText(id, text) {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    },

    _formatCash(amount) {
      if (!amount && amount !== 0) return '—';
      const abs    = Math.abs(amount);
      const prefix = amount < 0 ? '-' : '';
      if (abs >= 1e9) return `${prefix}$${(abs/1e9).toFixed(2)}B`;
      if (abs >= 1e6) return `${prefix}$${(abs/1e6).toFixed(1)}M`;
      if (abs >= 1e3) return `${prefix}$${(abs/1e3).toFixed(0)}K`;
      return `${prefix}$${abs.toFixed(0)}`;
    },

    // Legacy helper stubs
    setOrigin(airportId) { SkyHigh.MapEngine.setOriginAirport(airportId); UI._hideOverlayCard(); },
    setDest(airportId)   { SkyHigh.MapEngine.setDestAirport(airportId);   UI._hideOverlayCard(); UI._showRouteProjection(); },

    // ── GAME TICKER UPDATE (Fix 4) ────────────────────────
    _updateGameTicker() {
      const s = SkyHigh.CoreSim.getState?.();
      if (!s) return;
      const el = document.getElementById('game-ticker-content');
      if (!el) return;
      const msgs = [
        `Q${s.round}/20`,
        `Cash: ${UI._formatCash(s.cash)}`,
        s.routes.length ? `${s.routes.length} active route${s.routes.length !== 1 ? 's' : ''}` : 'No routes — click airports to open routes',
        `Board: ${s.boardConfidence} · Safety: ${s.safetyShield} · Crew: ${s.crewLoyalty}`,
        s.cascadeCards?.length ? `Board Cards: ${s.cascadeCards.join(', ')}` : 'No board cards yet',
      ];
      el.textContent = msgs.join('   ●   ');
    },

    // ── GUIDE CAPTAIN MARCUS (Fix 5) ─────────────────────
    _showGuide(text) {
      const el = document.getElementById('guide-marcus');
      const textEl = document.getElementById('guide-text');
      if (!el || !textEl) return;
      textEl.innerHTML = text;
      el.style.display = 'flex';
      // Re-trigger animation
      el.style.animation = 'none';
      requestAnimationFrame(() => { el.style.animation = ''; });
    },

    guideNext() {
      const s = SkyHigh.CoreSim.getState?.();
      if (!s || s.round > 5) { UI.guideDismiss(); return; }
      _guideStep = Math.min(_guideStep + 1, _guideSteps.length - 1);
      const step = _guideSteps[_guideStep];
      if (step) UI._showGuide(step.text);
    },

    guideDismiss() {
      const el = document.getElementById('guide-marcus');
      if (el) el.style.display = 'none';
      _guideActive = false;
    },

    _advanceGuide(trigger) {
      const s = SkyHigh.CoreSim.getState?.();
      if (!s || s.round > 5) return;
      const idx = _guideSteps.findIndex(step => step.trigger === trigger);
      if (idx >= 0 && idx >= _guideStep) {
        _guideStep = idx;
        _guideActive = true;
        UI._showGuide(_guideSteps[idx].text);
      }
    },

    // ── SAVE / LOAD (Fix 9) ───────────────────────────────
    saveGame() {
      const s = SkyHigh.CoreSim.getState?.();
      if (!s) return;
      const save = {
        v: 2,
        savedAt: Date.now(),
        profile: {
          ceoName:      s.ceoName,
          airlineName:  s.airlineName,
          airlineCode:  s.airlineCode,
          hubAirportId: s.hubAirportId,
          doctrineId:   s.doctrineId,
        },
        state: JSON.parse(JSON.stringify(s)),
      };
      try {
        localStorage.setItem('skyhigh_save', JSON.stringify(save));
        UI.toast('Game saved!', 'success', 2000);
      } catch(e) {
        UI.toast('Save failed — storage may be full', 'error');
      }
    },

    loadGame() {
      try {
        const raw = localStorage.getItem('skyhigh_save');
        if (!raw) return null;
        const save = JSON.parse(raw);
        if (!save?.state) return null;
        return save;
      } catch(e) {
        return null;
      }
    },

    hasSave() {
      return !!localStorage.getItem('skyhigh_save');
    },

    deleteSave() {
      localStorage.removeItem('skyhigh_save');
    },

    // ── AUTH UI ───────────────────────────────────────────────

    authShowTab(tab) {
      document.getElementById('auth-form-login').style.display    = tab === 'login'    ? 'flex' : 'none';
      document.getElementById('auth-form-register').style.display = tab === 'register' ? 'flex' : 'none';
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      document.getElementById(`auth-tab-${tab}`)?.classList.add('active');
    },

    async authLogin() {
      const field  = document.getElementById('auth-login-email');
      const pass   = document.getElementById('auth-login-pass');
      const errEl  = document.getElementById('auth-login-error');
      const btn    = document.getElementById('btn-auth-login');
      if (!field || !pass) return;
      if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }

      if (!SkyHigh.Auth.isEnabled()) {
        if (errEl) {
          errEl.textContent = 'Online accounts require Firebase — connect a project in firebase-config.js to enable login.';
          errEl.style.display = 'block';
        }
        return;
      }

      btn && (btn.disabled = true, btn.textContent = 'Signing in…');
      const result = await SkyHigh.Auth.login(field.value.trim(), pass.value);

      btn && (btn.disabled = false, btn.textContent = 'Sign In  →');
      if (!result.ok) {
        if (errEl) { errEl.textContent = result.reason; errEl.style.display = 'block'; }
        return;
      }
      UI._afterAuth(result.user);
    },

    async authRegister() {
      const userEl = document.getElementById('auth-reg-username');
      const email  = document.getElementById('auth-reg-email');
      const pass   = document.getElementById('auth-reg-pass');
      const errEl  = document.getElementById('auth-reg-error');
      const btn    = document.getElementById('btn-auth-register');
      if (!email || !userEl || !pass) return;
      if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
      btn && (btn.disabled = true, btn.textContent = 'Creating…');

      const result = await SkyHigh.Auth.register(email.value.trim(), pass.value, userEl.value.trim());

      btn && (btn.disabled = false, btn.textContent = 'Create Account  →');
      if (!result.ok) {
        if (errEl) { errEl.textContent = result.reason; errEl.style.display = 'block'; }
        return;
      }
      UI._afterAuth(result.user);
    },

    authSkip() {
      UI.showScreen('setup');
    },

    _afterAuth(user) {
      // Update splash user pill if visible
      UI._updateSplashUserPill(user);
      // Go to team screen or directly to setup
      UI.showScreen('team');
      UI._renderTeamLobbyState(user);
    },

    _updateSplashUserPill(user) {
      const loggedInRow = document.getElementById('splash-logged-in-row');
      const loginBtn    = document.getElementById('btn-go-login');
      const nameEl      = document.getElementById('splash-username-display');
      if (user) {
        if (loggedInRow) loggedInRow.style.display = 'flex';
        if (loginBtn)    loginBtn.style.display     = 'none';
        if (nameEl)      nameEl.textContent          = `👤 ${user.username}`;
      } else {
        if (loggedInRow) loggedInRow.style.display = 'none';
        if (loginBtn)    loginBtn.style.display     = '';
        if (nameEl)      nameEl.textContent          = '';
      }
    },

    // ── TEAM UI ───────────────────────────────────────────────

    _renderTeamLobbyState(user) {
      const lobby  = document.getElementById('team-lobby-state');
      const roster = document.getElementById('team-roster-state');
      if (!lobby || !roster) return;

      // Update user pill in team screen header
      const pillName = document.getElementById('team-user-name');
      if (pillName && user) pillName.textContent = user.username;

      if (user?.teamId) {
        // User is already in a team — load roster
        lobby.style.display  = 'none';
        roster.style.display = 'flex';
        SkyHigh.Auth.getTeam(user.teamId).then(team => {
          if (team) UI._renderTeamRoster(team);
        });
        SkyHigh.Auth.listenTeam(user.teamId, team => UI._renderTeamRoster(team));
      } else {
        lobby.style.display  = 'flex';
        roster.style.display = 'none';
      }
    },

    async teamCreate() {
      const nameEl = document.getElementById('input-team-name');
      const btn    = document.querySelector('.team-action-card:first-child .auth-btn-primary');
      if (!nameEl) return;

      btn && (btn.disabled = true);
      const result = await SkyHigh.Auth.createTeam(nameEl.value.trim());
      btn && (btn.disabled = false);

      if (!result.ok) {
        UI.toast(result.reason || 'Failed to create team', 'error', 3000);
        return;
      }
      // Show roster
      const lobby  = document.getElementById('team-lobby-state');
      const roster = document.getElementById('team-roster-state');
      if (lobby)  lobby.style.display  = 'none';
      if (roster) roster.style.display = 'flex';

      const team = await SkyHigh.Auth.getTeam(result.teamId);
      if (team) UI._renderTeamRoster(team);
      SkyHigh.Auth.listenTeam(result.teamId, t => UI._renderTeamRoster(t));
    },

    async teamJoin() {
      const codeEl = document.getElementById('input-invite-code');
      const btn    = document.querySelector('.team-action-card:last-child .auth-btn-primary');
      if (!codeEl) return;

      btn && (btn.disabled = true);
      const result = await SkyHigh.Auth.joinTeam(codeEl.value.trim().toUpperCase());
      btn && (btn.disabled = false);

      if (!result.ok) {
        UI.toast(result.reason || 'Invalid invite code', 'error', 3000);
        return;
      }
      const lobby  = document.getElementById('team-lobby-state');
      const roster = document.getElementById('team-roster-state');
      if (lobby)  lobby.style.display  = 'none';
      if (roster) roster.style.display = 'flex';

      const team = await SkyHigh.Auth.getTeam(result.teamId);
      if (team) UI._renderTeamRoster(team);
      SkyHigh.Auth.listenTeam(result.teamId, t => UI._renderTeamRoster(t));
    },

    teamSkip() {
      SkyHigh.Auth.stopListenTeam?.();
      UI.showScreen('setup');
    },

    teamReady() {
      SkyHigh.Auth.stopListenTeam?.();
      UI.showScreen('setup');
    },

    async teamLeave() {
      await SkyHigh.Auth.leaveTeam?.();
      const lobby  = document.getElementById('team-lobby-state');
      const roster = document.getElementById('team-roster-state');
      if (lobby)  lobby.style.display  = 'flex';
      if (roster) roster.style.display = 'none';
    },

    teamCopyCode() {
      const code = document.getElementById('team-invite-code')?.textContent;
      if (!code || code === '—') return;
      navigator.clipboard.writeText(code).then(() => {
        UI.toast('Invite code copied!', 'success', 2000);
      }).catch(() => {
        UI.toast(code, 'info', 5000);
      });
    },

    _renderTeamRoster(team) {
      // Update invite code display
      const codeEl = document.getElementById('team-invite-code');
      if (codeEl) codeEl.textContent = team.inviteCode || '—';

      // Update team name header
      const nameEl = document.getElementById('team-name-display');
      if (nameEl) nameEl.textContent = team.teamName || 'Your Team';

      // Render member slots
      const slotsEl = document.getElementById('team-slots');
      const roles   = SkyHigh.Auth.getRoles();
      const currentUser = SkyHigh.Auth.getUser();
      if (slotsEl) {
        const allRoles = ['CEO', 'CMO', 'CFO', 'CHRO'];
        slotsEl.innerHTML = allRoles.map(role => {
          const member = team.members?.find(m => m.role === role);
          const meta   = roles[role] || {};
          if (member) {
            const isMe    = member.uid === currentUser?.uid;
            const online  = member.online !== false;
            return `<div class="team-slot occupied ${isMe ? 'me' : ''}">
              <span class="team-slot-online ${online ? '' : 'offline'}"></span>
              <span class="team-slot-icon">${meta.icon || '👤'}</span>
              <span class="team-slot-role">${role}</span>
              <span class="team-slot-name">${member.username}${isMe ? ' (you)' : ''}</span>
            </div>`;
          } else {
            return `<div class="team-slot empty">
              <span class="team-slot-icon">${meta.icon || '👤'}</span>
              <span class="team-slot-role">${role}</span>
              <span class="team-slot-name">Open</span>
            </div>`;
          }
        }).join('');
      }

      // Render role picker (only for current user to change their own role)
      UI._renderTeamRoleGrid(team);
    },

    _renderTeamRoleGrid(team) {
      const gridEl = document.getElementById('team-role-grid');
      const roles  = SkyHigh.Auth.getRoles();
      const user   = SkyHigh.Auth.getUser();
      if (!gridEl || !user) return;

      const takenRoles = (team.members || []).filter(m => m.uid !== user.uid).map(m => m.role);
      const myRole     = (team.members || []).find(m => m.uid === user.uid)?.role;

      gridEl.innerHTML = Object.entries(roles).map(([key, meta]) => {
        const taken    = takenRoles.includes(key);
        const selected = myRole === key;
        return `<button class="team-role-btn ${selected ? 'selected' : ''} ${taken ? 'taken' : ''}"
          ${taken ? 'disabled' : ''}
          onclick="SkyHigh.UI.teamPickRole('${key}')">
          <span class="team-role-icon">${meta.icon}</span>
          <span class="team-role-name">${key}</span>
          <span class="team-role-label">${meta.label}</span>
          <span class="team-role-desc">${meta.desc}</span>
        </button>`;
      }).join('');
    },

    async teamPickRole(newRole) {
      const user = SkyHigh.Auth.getUser();
      if (!user?.teamId) return;
      const result = await SkyHigh.Auth.changeRole(user.teamId, newRole);
      if (!result.ok) {
        UI.toast(result.reason || 'Role unavailable', 'error', 2500);
      } else {
        UI.toast(`Role changed to ${newRole}`, 'success', 2000);
      }
    },

    async authLogout() {
      SkyHigh.Auth.stopListenTeam?.();
      await SkyHigh.Auth.logout?.();
      UI._updateSplashUserPill(null);
      UI.showScreen('splash');
      UI.toast('Signed out.', 'info', 2000);
    },

    // Route FAB: open projection if dest already chosen, else hint user
    _fabRouteClick() {
      const sel = SkyHigh.MapEngine.getSelection?.();
      if (sel?.originAirport && sel?.destAirport) {
        UI._showRouteProjection();
      } else {
        UI.toast('Pick a destination first — use the 📍 Destination button', 'info', 3000);
        // Pulse the destination button to draw attention
        const btn = document.getElementById('fab-btn-destination');
        if (btn) {
          btn.style.transition = 'box-shadow 0.15s';
          btn.style.boxShadow = '0 0 0 3px rgba(200,147,58,0.7)';
          setTimeout(() => { btn.style.boxShadow = ''; }, 700);
        }
      }
    },

    // ── DESTINATION DROPDOWN ──────────────────────────────────────
    // Country-based destination picker with fly-to + glow.
    // Two sections: Recommended (nearby) + All Destinations.
    _destDropdownOpen: false,

    // Haversine distance helper (km)
    _haversineDist(lat1, lon1, lat2, lon2) {
      const R = 6371, r = d => d * Math.PI / 180;
      const dLat = r(lat2 - lat1), dLon = r(lon2 - lon1);
      const a = Math.sin(dLat/2)**2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLon/2)**2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    },

    // Build per-country summary sorted by closest-airport distance from hub
    _buildCountryList(hub) {
      const airports  = SkyHigh.MAP_DATA.airports || [];
      const countries = SkyHigh.WORLD_COUNTRIES   || {};
      const s         = SkyHigh.CoreSim.getState?.();
      const openRouteIds = new Set((s?.routes || []).map(r => r.destinationId));

      // Group airports by countryIso
      const byCountry = {};
      airports.forEach(ap => {
        if (ap.id === hub.id) return;
        const iso = ap.countryIso;
        if (!iso) return;
        const dist = UI._haversineDist(hub.lat, hub.lon, ap.lat, ap.lon);
        if (!byCountry[iso]) {
          byCountry[iso] = { iso, airports: [], minDist: Infinity, hasRoute: false };
        }
        byCountry[iso].airports.push({ ...ap, dist });
        if (dist < byCountry[iso].minDist) byCountry[iso].minDist = dist;
        if (openRouteIds.has(ap.id)) byCountry[iso].hasRoute = true;
      });

      // Attach world info, compute center of country airports
      return Object.values(byCountry).map(c => {
        const info = countries[c.iso] || { name: `Country #${c.iso}`, region: 'Unknown', emoji: '🌍' };
        const closestApt = c.airports.sort((a,b) => a.dist - b.dist)[0];
        const centerLat = c.airports.reduce((s,a) => s + a.lat, 0) / c.airports.length;
        const centerLon = c.airports.reduce((s,a) => s + a.lon, 0) / c.airports.length;
        return {
          iso: c.iso,
          name: info.name,
          emoji: info.emoji || '🌍',
          region: info.region || '',
          risk: info.risk || 'MEDIUM',
          tier: info.tier || 'MEDIUM',
          minDist: c.minDist,
          closestApt,
          centerLat,
          centerLon,
          hasRoute: c.hasRoute,
          airports: c.airports,
        };
      }).sort((a, b) => a.minDist - b.minDist);
    },

    showDestinationDropdown() {
      const s = SkyHigh.CoreSim.getState?.();
      if (!s) return;
      const hub = SkyHigh.GeoUtils.getAirport(s.hubAirportId);
      if (!hub) return;

      // Toggle
      if (UI._destDropdownOpen) { UI.hideDestinationDropdown(); return; }

      const panel = document.getElementById('dest-dropdown-panel');
      if (!panel) return;

      UI._destDropdownOpen = true;
      document.getElementById('fab-btn-destination')?.classList.add('active');

      // Clear search
      const searchEl = document.getElementById('dest-search-input');
      if (searchEl) searchEl.value = '';

      panel.style.display = 'flex';
      requestAnimationFrame(() => panel.classList.add('ddp-visible'));

      // Store hub for re-renders
      UI._destHub = hub;
      UI._renderCountryList('');

      setTimeout(() => searchEl?.focus(), 160);
    },

    hideDestinationDropdown() {
      const panel = document.getElementById('dest-dropdown-panel');
      if (!panel) return;
      panel.classList.remove('ddp-visible');
      setTimeout(() => { panel.style.display = 'none'; }, 240);
      UI._destDropdownOpen = false;
      UI._destHub = null;
      document.getElementById('fab-btn-destination')?.classList.remove('active');
      // Clear country glow
      SkyHigh.MapEngine?.clearHighlight?.();
    },

    _renderCountryList(query) {
      const list = document.getElementById('dest-country-list');
      if (!list) return;
      const hub = UI._destHub;
      if (!hub) return;

      let countries = UI._buildCountryList(hub);

      if (query) {
        const q = query.toLowerCase();
        countries = countries.filter(c =>
          c.name.toLowerCase().includes(q) ||
          c.region.toLowerCase().includes(q) ||
          c.closestApt?.id?.toLowerCase().includes(q) ||
          c.closestApt?.city?.toLowerCase().includes(q)
        );
      }

      if (!countries.length) {
        list.innerHTML = '<div class="ddp-empty">No destinations found</div>';
        return;
      }

      // Split: recommended = closest airport within 4500 km
      const RECOMMEND_THRESHOLD = 4500;
      const recommended = query ? [] : countries.filter(c => c.minDist <= RECOMMEND_THRESHOLD);
      const rest        = query ? countries : countries.filter(c => c.minDist > RECOMMEND_THRESHOLD);

      function distBadge(km) {
        if (km < 2000)  return '<span class="ddp-dist-badge close">CLOSE</span>';
        if (km < 5000)  return '<span class="ddp-dist-badge medium">MEDIUM</span>';
        if (km < 9000)  return '<span class="ddp-dist-badge long">LONG</span>';
        return '<span class="ddp-dist-badge ultra">ULTRA</span>';
      }

      function renderRow(c) {
        const distStr = c.minDist >= 1000
          ? `${(c.minDist/1000).toFixed(1)}k km`
          : `${Math.round(c.minDist)} km`;
        const routedBadge = c.hasRoute ? '<span class="ddp-routed-badge">✈ Route</span>' : '';
        return `<div class="ddp-country-row" onclick="SkyHigh.UI.selectDestinationCountry(${c.iso})">
          <span class="ddp-flag">${c.emoji}</span>
          <div class="ddp-country-info">
            <div class="ddp-country-name">${c.name} ${routedBadge}</div>
            <div class="ddp-country-meta">${c.closestApt?.city || ''} · ${c.closestApt?.id || ''} · ${distStr}</div>
          </div>
          ${distBadge(c.minDist)}
          <span class="ddp-row-arrow">›</span>
        </div>`;
      }

      let html = '';

      if (recommended.length) {
        html += `<div class="ddp-section">
          <span class="ddp-section-dot green"></span>
          RECOMMENDED — Nearby Routes
        </div>`;
        html += recommended.map(renderRow).join('');
      }

      if (rest.length) {
        html += `<div class="ddp-section">
          <span class="ddp-section-dot gold"></span>
          ${query ? 'RESULTS' : 'ALL DESTINATIONS — Future Expansion'}
        </div>`;
        html += rest.map(renderRow).join('');
      }

      list.innerHTML = html;
    },

    selectDestinationCountry(isoNumeric) {
      // Find country data
      const countries = UI._buildCountryList(UI._destHub || {});
      const c = countries.find(x => x.iso === isoNumeric);
      if (!c) return;

      // Close dropdown
      UI.hideDestinationDropdown();

      // Glow the selected country
      SkyHigh.MapEngine.highlightCountry(isoNumeric);

      // Fly to country center, zoom in nicely
      const zoomLevel = c.minDist < 2000 ? 3.8 : c.minDist < 6000 ? 3.2 : 2.5;
      SkyHigh.MapEngine.flyTo(c.centerLat, c.centerLon, zoomLevel);

      // After fly animation, show country overlay
      setTimeout(() => {
        UI._showCountryOverlay({
          iso: c.iso,
          name: c.name,
          emoji: c.emoji,
          region: c.region,
          risk: c.risk,
          tier: c.tier,
          clickPx: null,   // will default to mapW2/2 inside _showCountryOverlay
          clickPy: null,
        });
      }, 950);
    },
  };

  return UI;
})();
