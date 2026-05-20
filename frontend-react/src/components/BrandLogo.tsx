type BrandLogoProps = {
  size?: "sm" | "md" | "lg";
  withText?: boolean;
};

const sizeMap = {
  sm: { box: "h-8 w-8 text-sm rounded-lg", text: "text-base" },
  md: { box: "h-10 w-10 text-base rounded-[10px]", text: "text-xl" },
  lg: { box: "h-14 w-14 text-xl rounded-2xl", text: "text-2xl" },
};

export default function BrandLogo({
  size = "md",
  withText = true,
}: BrandLogoProps) {
  const styles = sizeMap[size];
  return (
    <div className="inline-flex items-center gap-3">
      <div
        className={`${styles.box} flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20`}
        style={{
          backgroundImage:
            "linear-gradient(135deg, var(--accent-from) 0%, var(--accent-to) 100%)",
        }}
      >
        D
      </div>
      {withText && (
        <span
          className={`${styles.text} font-bold tracking-tight`}
          style={{ color: "var(--text-primary)" }}
        >
          Dossier
        </span>
      )}
    </div>
  );
}
