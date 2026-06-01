"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { BUILTIN_MUSIC_TRACKS } from "@/audio/musicTracks";
import type { MusicAccent, MusicTrack } from "@/audio/types";

const ACCENT_TOKEN: Record<MusicAccent, string> = {
  cyan: "var(--cyan)",
  pink: "var(--pink)",
  green: "var(--green)",
  amber: "var(--amber)"
};

type MusicScreenProps = {
  selectedTrackId: string | null;
  onSelect: (track: MusicTrack) => void;
  onPreview: (track: MusicTrack) => void;
  onStopPreview: () => void;
  onClose: () => void;
};

export function MusicScreen({ selectedTrackId, onSelect, onPreview, onStopPreview, onClose }: MusicScreenProps) {
  const [tracks, setTracks] = useState<MusicTrack[]>(BUILTIN_MUSIC_TRACKS);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  // Merge any custom tracks stored in MongoDB on top of the built-ins. The
  // built-ins are always shown, so this works offline / with no Mongo.
  useEffect(() => {
    let active = true;

    fetch("/api/music/tracks")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { ok?: boolean; tracks?: MusicTrack[] } | null) => {
        if (!active || !data?.ok || !Array.isArray(data.tracks)) {
          return;
        }

        const byId = new Map<string, MusicTrack>();
        [...BUILTIN_MUSIC_TRACKS, ...data.tracks].forEach((track) => byId.set(track.id, track));
        setTracks(Array.from(byId.values()));
      })
      .catch(() => {
        // Offline or Mongo not configured — the built-in tracks are already shown.
      });

    return () => {
      active = false;
    };
  }, []);

  // Stop any audition when the screen closes.
  useEffect(() => {
    return () => {
      onStopPreview();
    };
  }, [onStopPreview]);

  const handlePreview = (track: MusicTrack) => {
    if (previewingId === track.id) {
      setPreviewingId(null);
      onStopPreview();
      return;
    }

    setPreviewingId(track.id);
    onPreview(track);
  };

  const handleSelect = (track: MusicTrack) => {
    onSelect(track);

    if (previewingId) {
      setPreviewingId(null);
      onStopPreview();
    }
  };

  return (
    <div className="admin-dialog-backdrop" onClick={onClose}>
      <section
        aria-labelledby="music-title"
        aria-modal="true"
        className="admin-dialog music-dialog"
        id="music-screen"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="admin-panel">
          <div className="admin-panel-header">
            <h3 id="music-title">Music</h3>
            <div className="admin-panel-header-actions">
              <span>Track deck</span>
              <button
                aria-label="Close Tracks"
                className="dialog-icon-button"
                onClick={onClose}
                type="button"
              >
                Close
              </button>
            </div>
          </div>

          <p className="music-intro">
            Pick a theme for your matches. The selected track plays during the game and still shifts
            with the action. Originals — inspired by, never copied from, the films.
          </p>

          <div className="music-track-grid" role="list" aria-label="Music tracks">
            {tracks.map((track, index) => {
              const isSelected = selectedTrackId === track.id;
              const isPreviewing = previewingId === track.id;

              return (
                <article
                  className="music-track-card"
                  data-previewing={isPreviewing}
                  data-selected={isSelected}
                  key={track.id}
                  role="listitem"
                  style={
                    {
                      "--track-accent": ACCENT_TOKEN[track.accent],
                      animationDelay: `${index * 60}ms`
                    } as CSSProperties
                  }
                >
                  <div className="music-track-meta">
                    <span className="music-eq" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                      <span />
                    </span>
                    <span className="music-track-title">
                      <strong>{track.title}</strong>
                      <small>{track.subtitle}</small>
                    </span>
                    {track.source === "custom" ? <span className="music-track-tag">Custom</span> : null}
                  </div>

                  <p className="music-track-inspiration">{track.inspiration}</p>

                  <div className="music-track-actions">
                    <button
                      aria-pressed={isSelected}
                      className="command-button"
                      onClick={() => handleSelect(track)}
                      type="button"
                    >
                      {isSelected ? "Selected" : "Select"}
                    </button>
                    <button
                      aria-label={isPreviewing ? `Stop preview of ${track.title}` : `Preview ${track.title}`}
                      aria-pressed={isPreviewing}
                      className="command-button secondary"
                      onClick={() => handlePreview(track)}
                      type="button"
                    >
                      {isPreviewing ? "Stop" : "Preview"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <button className="dialog-close-button" onClick={onClose} type="button">
            Close
          </button>
        </div>
      </section>
    </div>
  );
}
