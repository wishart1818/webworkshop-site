"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ResolvedPreviewImage, PreviewImageSource, PreviewImageSlot } from "@/lib/preview-image-resolver";

export type PreviewImageRenderSlot = PreviewImageSlot | "proof";

type TradePreviewImageProps = {
  alt: string;
  section?: string;
  slot: PreviewImageRenderSlot;
  src: string;
  source: PreviewImageSource;
  candidates?: ResolvedPreviewImage[];
};

type ImageState = "loading" | "accepted" | "uncertain" | "unavailable";

export type RenderedImageEvidence = {
  loaded: boolean;
  naturalWidth: number;
  naturalHeight: number;
  renderedWidth: number;
  renderedHeight: number;
  luminanceVariance?: number;
  edgeDensity?: number;
  dominantColorConcentration?: number;
};

export function classifyRenderedImageEvidence(evidence: RenderedImageEvidence) {
  const {
    loaded,
    naturalWidth,
    naturalHeight,
    renderedWidth,
    renderedHeight,
    luminanceVariance,
    edgeDensity,
    dominantColorConcentration,
  } = evidence;
  if (!loaded || naturalWidth <= 0 || naturalHeight <= 0 || renderedWidth < 160 || renderedHeight < 120) return "unavailable" as const;
  const naturalRatio = naturalWidth / naturalHeight;
  const renderedRatio = renderedWidth / Math.max(renderedHeight, 1);
  const cropCoverage = naturalRatio > renderedRatio ? renderedRatio / naturalRatio : naturalRatio / renderedRatio;
  const pixelSignals = [
    luminanceVariance !== undefined && luminanceVariance < 85,
    edgeDensity !== undefined && edgeDensity < 0.035,
    dominantColorConcentration !== undefined && dominantColorConcentration > 0.72,
  ];
  const measuredPixelSignals = [luminanceVariance, edgeDensity, dominantColorConcentration].filter((value) => value !== undefined).length;
  const weakPixelSignals = pixelSignals.filter(Boolean).length;
  if (cropCoverage < 0.18 || (measuredPixelSignals >= 2 && weakPixelSignals >= 3)) return "unavailable" as const;
  if (cropCoverage < 0.3 || (measuredPixelSignals >= 2 && weakPixelSignals === 2)) return "uncertain" as const;
  return "accepted" as const;
}

function renderedImageSignals(image: HTMLImageElement) {
  const rect = image.getBoundingClientRect();
  let luminanceVariance: number | undefined;
  let edgeDensity: number | undefined;
  let dominantColorConcentration: number | undefined;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 24;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas unavailable");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const luminance: number[] = [];
    const colorBuckets = new Map<string, number>();
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index] ?? 0;
      const green = pixels[index + 1] ?? 0;
      const blue = pixels[index + 2] ?? 0;
      luminance.push((red * 0.2126) + (green * 0.7152) + (blue * 0.0722));
      const bucket = `${Math.round(red / 32)}-${Math.round(green / 32)}-${Math.round(blue / 32)}`;
      colorBuckets.set(bucket, (colorBuckets.get(bucket) ?? 0) + 1);
    }
    const mean = luminance.reduce((sum, value) => sum + value, 0) / Math.max(luminance.length, 1);
    luminanceVariance = luminance.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / Math.max(luminance.length, 1);
    let edges = 0;
    for (let row = 0; row < canvas.height; row += 1) {
      for (let column = 1; column < canvas.width; column += 1) {
        const position = (row * canvas.width) + column;
        if (Math.abs((luminance[position] ?? 0) - (luminance[position - 1] ?? 0)) > 18) edges += 1;
      }
    }
    edgeDensity = edges / Math.max(luminance.length, 1);
    dominantColorConcentration = Math.max(...colorBuckets.values(), 0) / Math.max(luminance.length, 1);
  } catch {
    // Cross-origin images may prevent pixel reads; load, crop, and semantic metadata remain usable signals.
  }
  return {
    status: classifyRenderedImageEvidence({
      loaded: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      renderedWidth: rect.width,
      renderedHeight: rect.height,
      luminanceVariance,
      edgeDensity,
      dominantColorConcentration,
    }),
    width: image.naturalWidth,
    height: image.naturalHeight,
  };
}

export function TradePreviewImage({ alt, candidates = [], slot, src, source }: TradePreviewImageProps) {
  const sources = useMemo(() => {
    const initial = { alt, src, source };
    return [initial, ...candidates.map((candidate) => ({ alt: candidate.alt, src: candidate.src, source: candidate.source }))]
      .filter((candidate, index, items) => candidate.src && items.findIndex((item) => item.src === candidate.src) === index);
  }, [alt, candidates, source, src]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [imageState, setImageState] = useState<ImageState>("loading");
  const imageRef = useRef<HTMLImageElement>(null);
  const candidate = sources[candidateIndex] ?? sources[0];

  const advanceCandidate = () => {
    if (candidateIndex + 1 < sources.length) {
      setCandidateIndex((index) => index + 1);
      setImageState("loading");
      return;
    }
    setImageState("unavailable");
  };

  const handleImageError = () => {
    advanceCandidate();
  };

  const evaluateImage = (image: HTMLImageElement) => {
    const result = renderedImageSignals(image);
    const criticalPlacement = slot === "hero";
    if (result.status === "unavailable" || (criticalPlacement && result.status === "uncertain")) {
      advanceCandidate();
      return;
    }
    setImageState(result.status);
  };

  const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    evaluateImage(event.currentTarget);
  };

  useEffect(() => {
    const image = imageRef.current;
    if (!image?.complete) return;
    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      advanceCandidate();
      return;
    }
    evaluateImage(image);
    // Re-evaluate cached images whenever the selected candidate changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate?.src]);

  return (
    <figure
      className={`prospect-preview-image prospect-preview-image--${slot}`}
      data-preview-image-source={candidate?.source ?? source}
      data-preview-image-src={candidate?.src ?? src}
      data-preview-image-slot={slot}
      data-preview-image-state={imageState}
    >
      {imageState === "unavailable" ? null : (
        <>
          {/* Plain img keeps configured stock/business-photo URLs renderable without Next remote host config. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={candidate?.alt ?? alt}
            decoding="async"
            loading="eager"
            ref={imageRef}
            src={candidate?.src ?? src}
            onError={handleImageError}
            onLoad={handleImageLoad}
          />
        </>
      )}
    </figure>
  );
}
