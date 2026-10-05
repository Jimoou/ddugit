import { BRAND, FILLED, ICONS, type IconName } from "../icons";

/** One of ddugit's own icons, sized to the text around it and colored by it. */
export function Icon({
  name,
  size = 14,
  filled,
  className,
}: {
  name: IconName;
  size?: number;
  filled?: boolean;
  className?: string;
}) {
  const fill = filled ?? FILLED.has(name);
  // Dots (the "more" mark) need a heavy pen to read at icon sizes.
  const stroke = fill ? 1 : name === "more" ? 3.2 : 1.9;
  return (
    <svg
      className={`icon-svg ${className ?? ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke={BRAND.has(name) ? "none" : "currentColor"}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={ICONS[name]} />
    </svg>
  );
}
