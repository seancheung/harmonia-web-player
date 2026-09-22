const placeholders = Array.from(
  { length: 8 },
  (_, index) => `placeholder-${index}`,
);

function Lines() {
  return (
    <div className="skeleton-copy">
      <span className="skeleton-shape skeleton-line" />
      <span className="skeleton-shape skeleton-line skeleton-line-short" />
    </div>
  );
}

export function SkeletonHeading({ album = false }: { album?: boolean }) {
  return (
    <div
      className={`page-heading skeleton-heading ${album ? "album-heading" : ""}`}
      aria-hidden="true"
    >
      {album && <div className="cover skeleton-shape skeleton-art" />}
      <div className="skeleton-heading-copy">
        <div className="skeleton-shape skeleton-heading-title" />
        <div className="skeleton-shape skeleton-line skeleton-heading-subtitle" />
      </div>
    </div>
  );
}

export function LibrarySkeleton({
  label,
  variant = "rows",
  artists = false,
  folders = false,
}: {
  label: string;
  variant?: "home" | "cards" | "rows" | "song-grid";
  artists?: boolean;
  folders?: boolean;
}) {
  const cards = (home = false) => (
    <div
      className={
        variant === "song-grid"
          ? "song-grid"
          : `album-grid ${home ? "home-artist-grid" : folders ? "folder-grid" : artists ? "artist-grid" : ""}`
      }
    >
      {placeholders.map((id) => (
        <div
          className={`skeleton-card ${artists || home ? "skeleton-artist" : ""}`}
          key={id}
        >
          <div className="skeleton-shape skeleton-art" />
          <Lines />
        </div>
      ))}
    </div>
  );
  const rows = (home = false) => (
    <div className={home ? "home-songs" : "skeleton-rows"}>
      {placeholders.map((id) => (
        <div className={home ? "home-song" : "skeleton-row"} key={id}>
          <div
            className={`skeleton-shape ${home ? "home-cover" : "skeleton-row-cover"} ${artists ? "skeleton-round" : ""}`}
          />
          <Lines />
          {!home && <span className="skeleton-shape skeleton-row-meta" />}
        </div>
      ))}
    </div>
  );
  return (
    <div className="library-skeleton" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">
        {variant === "home"
          ? ["recent", "frequent", "artists", "unheard"].map((section) => (
              <div className="home-section" key={section}>
                <div className="home-section-heading">
                  <span className="skeleton-shape skeleton-section-title" />
                  <span className="skeleton-shape skeleton-section-action" />
                </div>
                {section === "artists" ? cards(true) : rows(true)}
              </div>
            ))
          : variant === "cards" || variant === "song-grid"
            ? cards()
            : rows()}
      </div>
    </div>
  );
}
