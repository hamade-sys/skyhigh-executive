// ============================================================
// SkyHigh Executive — Design Tokens
// Visual identity: Executive Noir + Amber Authority
// ============================================================
window.SkyHigh = window.SkyHigh || {};

window.SkyHigh.TOKENS = {
  // ── COLOR PALETTE ─────────────────────────────────────────
  color: {
    // Backgrounds
    bg:           '#08080F',
    bgSurface:    '#10101A',
    bgCard:       '#15151F',
    bgElevated:   '#1C1C28',
    bgOverlay:    'rgba(8,8,15,0.85)',

    // Primary — Executive Amber
    primary:       '#C8933A',
    primaryLight:  '#E8B050',
    primaryDark:   '#A07020',
    primaryGlow:   'rgba(200,147,58,0.25)',

    // Secondary — Deep Teal
    secondary:     '#1E4A5C',
    secondaryLight:'#2A6A82',
    secondaryDark: '#122E3A',

    // Accent — Electric Gold
    accent:        '#F0D060',
    accentSoft:    'rgba(240,208,96,0.15)',

    // Map colors
    mapOcean:      '#0A1520',
    mapLand:       '#16241A',
    mapLandHover:  '#1E3526',
    mapLandSelect: '#2A4A32',
    mapGrid:       'rgba(255,255,255,0.04)',
    mapBorder:     'rgba(100,180,120,0.25)',

    // Semantic
    success:       '#2ECC71',
    successDim:    'rgba(46,204,113,0.2)',
    warning:       '#F39C12',
    warningDim:    'rgba(243,156,18,0.2)',
    danger:        '#E74C3C',
    dangerDim:     'rgba(231,76,60,0.2)',
    dangerBright:  '#FF6B5B',
    info:          '#3498DB',
    infoDim:       'rgba(52,152,219,0.2)',

    // Text
    textPrimary:   '#EDE8D8',
    textSecondary: '#9A9080',
    textMuted:     '#5A5448',
    textGold:      '#C8933A',
    textDanger:    '#E74C3C',
    textSuccess:   '#2ECC71',

    // Borders
    borderFaint:   'rgba(255,255,255,0.06)',
    borderSubtle:  'rgba(200,147,58,0.2)',
    borderActive:  'rgba(200,147,58,0.6)',

    // Route arcs
    routeActive:   '#C8933A',
    routeProfitable:'#2ECC71',
    routeLoss:     '#E74C3C',
    routeIdle:     '#5A5448',

    // Crisis
    crisisRed:     '#C0392B',
    crisisGlow:    'rgba(192,57,43,0.4)',
    crisisEdge:    'rgba(231,76,60,0.6)',

    // Stage themes
    stage1:        '#2ECC71',  // optimism
    stage2:        '#F39C12',  // pressure
    stage3:        '#E74C3C',  // tension
    stage4:        '#C8933A',  // prestige
  },

  // ── TYPOGRAPHY ─────────────────────────────────────────────
  font: {
    display:  "'Cinzel', 'Playfair Display', Georgia, serif",
    ui:       "'Inter', 'Segoe UI', system-ui, sans-serif",
    data:     "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
    size: {
      hero:   '3.5rem',
      h1:     '2.25rem',
      h2:     '1.625rem',
      h3:     '1.25rem',
      body:   '0.9375rem',
      label:  '0.8125rem',
      micro:  '0.6875rem',
      num:    '1.125rem',
      numSm:  '0.9375rem',
    },
    weight: {
      light:   300,
      regular: 400,
      medium:  500,
      semibold:600,
      bold:    700,
    },
    lineHeight: {
      tight:  1.2,
      normal: 1.5,
      loose:  1.8,
    },
    letterSpacing: {
      tight:  '-0.02em',
      normal: '0',
      wide:   '0.05em',
      wider:  '0.1em',
      widest: '0.2em',
    }
  },

  // ── SPACING ────────────────────────────────────────────────
  space: {
    xs:  '4px',
    sm:  '8px',
    md:  '16px',
    lg:  '24px',
    xl:  '32px',
    xxl: '48px',
    xxxl:'64px',
  },

  // ── RADIUS ─────────────────────────────────────────────────
  radius: {
    sm:   '4px',
    md:   '8px',
    lg:   '12px',
    xl:   '16px',
    pill: '999px',
    circle:'50%',
  },

  // ── ELEVATION (shadows) ────────────────────────────────────
  shadow: {
    sm:    '0 1px 3px rgba(0,0,0,0.4)',
    md:    '0 4px 12px rgba(0,0,0,0.5)',
    lg:    '0 8px 24px rgba(0,0,0,0.6)',
    xl:    '0 16px 48px rgba(0,0,0,0.7)',
    gold:  '0 0 20px rgba(200,147,58,0.3)',
    crisis:'0 0 40px rgba(231,76,60,0.5)',
    inset: 'inset 0 1px 0 rgba(255,255,255,0.06)',
  },

  // ── MOTION ─────────────────────────────────────────────────
  motion: {
    duration: {
      fast:     '120ms',
      normal:   '220ms',
      slow:     '400ms',
      dramatic: '700ms',
      epic:     '1200ms',
    },
    easing: {
      snappy:    'cubic-bezier(0.4, 0, 0.2, 1)',
      spring:    'cubic-bezier(0.34, 1.56, 0.64, 1)',
      dramatic:  'cubic-bezier(0.16, 1, 0.3, 1)',
      linear:    'linear',
      easeIn:    'cubic-bezier(0.4, 0, 1, 1)',
      easeOut:   'cubic-bezier(0, 0, 0.2, 1)',
    }
  },

  // ── Z-INDEX ────────────────────────────────────────────────
  zIndex: {
    map:       1,
    mapOverlay:2,
    sidebar:   10,
    modal:     50,
    crisis:    60,
    toast:     70,
    tooltip:   80,
  },
};
