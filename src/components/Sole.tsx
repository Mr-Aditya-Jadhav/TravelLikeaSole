export default function Sole({
  className = '',
  small = false,
}: {
  className?: string;
  small?: boolean;
}) {
  return (
    <svg
      className={`sole ${className}`}
      width={small ? 40 : 108}
      height={small ? 40 : 90}
      viewBox="0 0 120 100"
      fill="none"
      aria-hidden="true"
    >
      <path d="M29 51 12 35q-5 15 0 32Z" fill="#E2AF62" stroke="#C28C47" strokeWidth="1.5" />
      <path
        d="M48 27q5-15 24-10l-1 15M48 72q5 14 23 10l-2-14"
        fill="#E2AF62"
        stroke="#C28C47"
        strokeWidth="1.5"
      />
      <path
        d="M28 50C34 21 77 15 101 48c-16 34-62 35-73 2Z"
        fill="#F2CD86"
        stroke="#C28C47"
        strokeWidth="1.8"
      />
      <path
        d="M42 47q10-15 23-15M41 57q7 9 18 10"
        stroke="#DEB56F"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <ellipse cx="80" cy="43" rx="4" ry="5" fill="#294E43" />
      <ellipse cx="79" cy="41" rx="1.2" ry="1.5" fill="white" />
      <ellipse cx="90" cy="53" rx="5" ry="3" fill="#E9AB7F" />
      <path d="M76 54q5 8 11 1" stroke="#754D30" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M58 46q-10 5 0 11"
        fill="#E2AF62"
        stroke="#C28C47"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {!small && (
        <>
          <circle cx="108" cy="26" r="4" stroke="#8EBAAA" strokeWidth="1.5" />
          <circle cx="112" cy="12" r="2.5" stroke="#8EBAAA" strokeWidth="1.5" />
        </>
      )}
    </svg>
  );
}
