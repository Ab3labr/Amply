interface BrandMarkProps {
  className?: string;
}

// Four interlocking "wave" tiles: the Amply glyph from the approved landing reference.
const tile =
  "M7 0 L14 0 Q16.5 0 18 2.4 C21 6.8 25 11.6 30 14.2 Q33 15.5 33 18.5 L33 28 Q33 31 30 31 L25 31 Q22 31 20.5 28.6 C16 22 9.5 17.6 5.5 15.5 Q3.5 14.5 3.5 12 L3.5 3 Q3.5 0 7 0 Z";

export function BrandMark({ className = "" }: BrandMarkProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 68 64"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={tile} />
      <path d={tile} transform="translate(35 0)" />
      <path d={tile} transform="translate(0 33)" />
      <path d={tile} transform="translate(35 33)" />
    </svg>
  );
}
