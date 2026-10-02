import { FILLED, ICONS, type IconName } from "../icons";

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
  return (
    <svg
      className={`icon-svg ${className ?? ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={fill ? 1 : 1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={ICONS[name]} />
    </svg>
  );
}
