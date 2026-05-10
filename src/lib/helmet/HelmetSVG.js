'use client'

// ─── Shared helmet SVG components ─────────────────────────────────────────────
// Used by:
//   1. src/app/leagues/[id]/helmet/page.js  (helmet builder)
//   2. src/app/leagues/[id]/draft/page.js   (draft lobby grid)

// Dome silhouette — side-profile football helmet, viewBox 0 0 300 260.
// Front at left (x≈22), crown at top (y≈15), back at right.
export const DOME_PATH =
  'M 62,192 C 36,180 22,148 22,108 C 22,62 68,20 148,15 ' +
  'C 225,10 270,55 272,112 C 274,162 254,200 226,206 ' +
  'C 195,212 88,208 62,192 Z'

export const FACE_COLOR = '#1A1A2E'

// ─── Pattern overlay (always clipped to dome via <g clipPath>) ────────────────
export function PatternLayer({ pattern, secondary, clipId, fadeId, sweepId }) {
  const wrap = (children, opacity = 0.88) => (
    <g clipPath={`url(#${clipId})`} opacity={opacity}>{children}</g>
  )

  switch (pattern) {
    case 'solid': return null

    case 'stripes': return wrap(<>
      <rect x="75"  y="0" width="34" height="260" fill={secondary} />
      <rect x="142" y="0" width="34" height="260" fill={secondary} />
      <rect x="209" y="0" width="34" height="260" fill={secondary} />
    </>)

    case 'chevron': return wrap(
      <polygon points="150,42 275,158 275,196 150,80 25,196 25,158" fill={secondary} />
    )

    case 'lightning': return wrap(
      <path d="M 152,18 L 198,100 L 165,100 L 214,206 L 167,116 L 200,116 Z" fill={secondary} />
    )

    case 'fade': return wrap(
      <rect x="0" y="0" width="300" height="260" fill={`url(#${fadeId})`} />, 1
    )

    case 'carbon': return wrap(
      <>
        {Array.from({ length: 9 }, (_, row) =>
          Array.from({ length: 10 }, (_, col) => {
            const x = col * 30 + (row % 2) * 15
            const y = row * 26
            return (
              <path
                key={`${row}-${col}`}
                d={`M ${x+15},${y} L ${x+28},${y+8} L ${x+28},${y+20} L ${x+15},${y+28} L ${x+2},${y+20} L ${x+2},${y+8} Z`}
                fill="none"
                stroke={secondary}
                strokeWidth="1.5"
              />
            )
          })
        )}
      </>,
      0.55
    )

    case 'flames': return wrap(<>
      <path d="M 55,262 C 48,218 72,196 60,168 C 49,144 66,133 57,108 C 70,133 64,146 76,164 C 80,143 92,132 83,108 C 98,132 90,148 98,170 C 105,194 92,220 98,262 Z" fill={secondary} />
      <path d="M 116,262 C 109,225 132,204 121,178 C 110,153 127,142 118,116 C 132,142 125,156 137,175 C 142,154 154,142 144,116 C 159,142 151,158 159,180 C 166,203 153,226 160,262 Z" fill={secondary} />
      <path d="M 177,262 C 171,227 193,207 182,182 C 171,157 188,146 180,121 C 193,146 186,160 197,179 C 201,159 212,147 203,121 C 218,147 210,163 217,185 C 224,208 211,228 217,262 Z" fill={secondary} />
      <path d="M 237,262 C 232,229 252,210 243,186 C 233,163 249,152 241,128 C 253,152 247,166 257,184 C 260,165 271,154 263,130 C 277,154 269,169 275,190 C 281,212 269,230 274,262 Z" fill={secondary} />
    </>)

    case 'camo': return wrap(<>
      <ellipse cx="82"  cy="76"  rx="44" ry="36" fill={secondary} opacity="0.85" />
      <ellipse cx="196" cy="55"  rx="54" ry="30" fill={secondary} opacity="0.75" />
      <ellipse cx="250" cy="148" rx="36" ry="48" fill={secondary} opacity="0.85" />
      <ellipse cx="124" cy="164" rx="48" ry="32" fill={secondary} opacity="0.75" />
      <ellipse cx="58"  cy="194" rx="34" ry="26" fill={secondary} opacity="0.85" />
      <ellipse cx="204" cy="204" rx="44" ry="32" fill={secondary} opacity="0.75" />
      <ellipse cx="150" cy="90"  rx="32" ry="26" fill={secondary} opacity="0.80" />
      <ellipse cx="266" cy="78"  rx="28" ry="38" fill={secondary} opacity="0.85" />
    </>)

    case 'split': return wrap(
      <rect x="150" y="0" width="150" height="260" fill={secondary} />
    )

    case 'diamond': return wrap(<>
      {[70, 148, 226].flatMap(cx =>
        [58, 130, 202].map(cy => (
          <polygon
            key={`${cx}-${cy}`}
            points={`${cx},${cy - 30} ${cx + 23},${cy} ${cx},${cy + 30} ${cx - 23},${cy}`}
            fill={secondary}
          />
        ))
      )}
    </>)

    case 'geometric': return wrap(<>
      <polygon points="22,108 148,15 92,110"  fill={secondary} opacity="0.92" />
      <polygon points="148,15 272,112 206,110" fill={secondary} opacity="0.72" />
      <polygon points="92,110 206,110 148,196" fill={secondary} opacity="0.84" />
    </>)

    case 'sweep': return wrap(
      <rect x="0" y="0" width="300" height="260" fill={`url(#${sweepId})`} />, 1
    )

    default: return null
  }
}

// ─── HelmetSVG — the full helmet rendering ────────────────────────────────────
// uid: unique string per instance (prevents clipPath ID collisions when multiple helmets shown)
// width/height: physical pixel dimensions (viewBox stays 300×260)
export function HelmetSVG({ base = '#1B2A4A', secondary = '#F0B429', pattern = 'solid', uid = 'h', width = 300, height = 260 }) {
  const clipId  = `dc-${uid}`
  const fadeId  = `fg-${uid}`
  const sweepId = `sg-${uid}`

  return (
    <svg
      viewBox="0 0 300 260"
      width={width}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={DOME_PATH} />
        </clipPath>
        <linearGradient id={fadeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={secondary} stopOpacity="0.95" />
          <stop offset="100%" stopColor={secondary} stopOpacity="0"    />
        </linearGradient>
        <linearGradient id={sweepId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"  stopColor={secondary} stopOpacity="0.95" />
          <stop offset="75%" stopColor={secondary} stopOpacity="0"    />
        </linearGradient>
        <radialGradient id={`sh-${uid}`} cx="38%" cy="28%" r="50%">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0"    />
        </radialGradient>
      </defs>

      {/* Ground shadow */}
      <ellipse cx="150" cy="244" rx="108" ry="10" fill="rgba(0,0,0,0.38)" />

      {/* Main dome — base color */}
      <path d={DOME_PATH} fill={base} />

      {/* Pattern overlay */}
      <PatternLayer
        pattern={pattern}
        secondary={secondary}
        clipId={clipId}
        fadeId={fadeId}
        sweepId={sweepId}
      />

      {/* Specular sheen */}
      <ellipse
        clipPath={`url(#${clipId})`}
        cx="112" cy="70" rx="76" ry="52"
        fill={`url(#sh-${uid})`}
      />

      {/* Inner shadow — bottom-right depth */}
      <path
        d="M 226,206 C 195,212 88,208 62,192 C 36,180 22,148 22,108"
        fill="none" stroke="rgba(0,0,0,0.24)" strokeWidth="10" strokeLinecap="round"
      />

      {/* Ear hole */}
      <ellipse cx="230" cy="158" rx="18" ry="23" fill="rgba(0,0,0,0.45)" />
      <ellipse cx="230" cy="158" rx="12" ry="16" fill="rgba(0,0,0,0.70)" />

      {/* Face guard cage */}
      <g fill="none" stroke={FACE_COLOR} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 24,114 C 34,100 52,93 64,92" />
        <path d="M 15,123 Q 39,120 59,119" />
        <path d="M 13,151 Q 37,148 58,147" />
        <path d="M 13,177 Q 37,175 58,173" />
        <line x1="24" y1="117" x2="21" y2="185" />
        <line x1="47" y1="115" x2="44" y2="181" />
        <path d="M 12,190 C 26,204 54,208 68,201" />
      </g>

      {/* Dome outline */}
      <path d={DOME_PATH} fill="none" stroke="rgba(0,0,0,0.40)" strokeWidth="2" />
    </svg>
  )
}
