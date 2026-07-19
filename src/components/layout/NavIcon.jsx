const PATHS = {
  chat: (
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4 3.5V16H6.5A2.5 2.5 0 0 1 4 13.5v-8Z" />
  ),
  qa: (
    <>
      <circle cx="9" cy="12" r="6" />
      <circle cx="15" cy="12" r="6" />
    </>
  ),
  draw: (
    <>
      <path d="M4 20l0.8-3.6L14.8 6.4a1 1 0 0 1 1.4 0l1.4 1.4a1 1 0 0 1 0 1.4L7.6 19.2 4 20Z" />
      <path d="M13.5 7.5l3 3" />
    </>
  ),
  scrapbook: (
    <>
      <path d="M4 5.5S6 4 9.5 4 12 5.7 12 5.7 12.5 4 16 4s5.5 1.5 5.5 1.5v13S19.5 17 16 17s-4 1.7-4 1.7-1-1.7-4.5-1.7S4 18.5 4 18.5v-13Z" />
      <path d="M12 5.7v13" />
    </>
  ),
  gallery: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M3.5 16.5l4.5-4.5 3.5 3.5 3-3 5 5" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M4 6.5l8 6.5 8-6.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9.5h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </>
  ),
  home: (
    <>
      <path d="M4 11.5L12 4l8 7.5" />
      <path d="M6 10v9h12v-9" />
      <path d="M10 19v-5h4v5" />
    </>
  ),
  thumbkiss: <path d="M12 19s-7-4.35-7-9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7 2.5C19 14.65 12 19 12 19Z" />,
  journal: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8.5 8h7" />
      <path d="M8.5 12h7" />
      <path d="M8.5 16h4" />
    </>
  ),
}

export default function NavIcon({ name, className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}
