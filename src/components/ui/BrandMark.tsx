interface BrandMarkProps {
  className?: string;
}

// Four interlocking "wave" tiles: the Amply glyph from the approved landing reference.
const tile =
  "M6.2 0 H13.5 Q16 0 18.25 2 L30.75 13 Q33 15 33 18 V28 Q33 31 30 31 H24 Q21 31 18.6 29.2 L5.9 19.3 Q3.5 17.5 3.5 14.5 V3 Q3.5 0 6.2 0 Z";

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
