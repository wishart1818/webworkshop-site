"use client";

import Image from "next/image";
import React from "react";
import { useState } from "react";

type TradePreviewImageProps = {
  alt: string;
  fallbackLabel: string;
  fallbackSrc: string;
  slot: "hero" | "service" | "proof";
  src: string;
};

type ImageState = "photo" | "fallback" | "unavailable";

export function TradePreviewImage({ alt, fallbackLabel, fallbackSrc, slot, src }: TradePreviewImageProps) {
  const [imageState, setImageState] = useState<ImageState>("photo");
  const activeSrc = imageState === "fallback" ? fallbackSrc : src;

  const handleImageError = () => {
    setImageState((current) => current === "photo" ? "fallback" : "unavailable");
  };

  return (
    <figure
      className={`prospect-preview-image prospect-preview-image--${slot}`}
      data-fallback-src={fallbackSrc}
      data-preview-image-slot={slot}
      data-preview-image-state={imageState}
    >
      {imageState === "unavailable" ? (
        <div className="prospect-preview-image__fallback" role="img" aria-label={`${fallbackLabel}. Representative concept visual.`}>
          <strong>{fallbackLabel}</strong>
          <span>Representative visual direction</span>
        </div>
      ) : (
        <Image
          alt={imageState === "fallback" ? `${alt}. Trade-specific illustration shown because the photo was unavailable.` : alt}
          src={activeSrc}
          fill
          priority={slot === "hero"}
          sizes={slot === "hero" ? "(max-width: 980px) 100vw, 52vw" : "(max-width: 767px) 100vw, 33vw"}
          onError={handleImageError}
          unoptimized
        />
      )}
    </figure>
  );
}
