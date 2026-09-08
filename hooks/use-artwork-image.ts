"use client";
import { useEffect, useState } from "react";
import { cachedArtwork, rememberArtwork } from "@/lib/client/recovery";
import { openArtwork } from "@/lib/client/artwork-storage";
import type { ArtworkLayer } from "@/lib/embroidery/types";

export function useArtworkImage(namespace: string, layer?: ArtworkLayer) {
  const assetId = layer?.assetId;
  const key = JSON.stringify([namespace, assetId]);
  const [loaded, setLoaded] = useState<{
    key: string;
    image?: HTMLImageElement;
    error?: string;
  }>();
  useEffect(() => {
    if (!assetId || !namespace) return;
    let active = true,
      url = "";
    async function load() {
      let file = await cachedArtwork(namespace, assetId!);
      if (!file && namespace.startsWith("account:")) {
        file = await openArtwork(assetId!);
        await rememberArtwork(namespace, assetId!, file);
      }
      if (!active) return;
      if (!file)
        throw new Error(
          "The reference image is unavailable on this device. Reattach the original artwork.",
        );
      url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        if (active) setLoaded({ key, image });
      };
      image.onerror = () => {
        if (active)
          setLoaded({
            key,
            error:
              "This reference image could not be displayed. Try PNG, JPEG, WebP or SVG.",
          });
      };
      image.src = url;
    }
    void load().catch((error) => {
      if (active)
        setLoaded({
          key,
          error:
            error instanceof Error ? error.message : "Artwork unavailable.",
        });
    });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [key, namespace, assetId]);
  return loaded?.key === key ? loaded : { key };
}
