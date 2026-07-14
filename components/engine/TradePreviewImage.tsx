"use client";

import React, { useState } from "react";
import type { PreviewImageSource, PreviewImageSlot } from "@/lib/preview-image-resolver";

export type PreviewImageRenderSlot = PreviewImageSlot | "proof";

type TradePreviewImageProps = {
  alt: string;
  section?: string;
  slot: PreviewImageRenderSlot;
  src: string;
  source: PreviewImageSource;
};

type ImageState = "photo" | "unavailable";

export function TradePreviewImage({ alt, section, slot, src, source }: TradePreviewImageProps) {
  const [imageState, setImageState] = useState<ImageState>("photo");

  const handleImageError = () => {
    setImageState("unavailable");
  };

  return (
    <figure
      className={`prospect-preview-image prospect-preview-image--${slot}`}
      data-preview-image-source={source}
      data-preview-image-slot={slot}
      data-preview-image-state={imageState}
    >
      {imageState === "unavailable" ? (
        <div className="prospect-preview-image__fallback" role="img" aria-label={`${alt}. Image unavailable.`}>
          <strong>{section || "Service photo"}</strong>
          <span>Photo unavailable</span>
        </div>
      ) : (
        <>
          {/* Plain img keeps configured stock/business-photo URLs renderable without Next remote host config. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={alt}
            decoding="async"
            loading={slot === "hero" ? "eager" : "lazy"}
            src={src}
            onError={handleImageError}
          />
        </>
      )}
    </figure>
  );
}
