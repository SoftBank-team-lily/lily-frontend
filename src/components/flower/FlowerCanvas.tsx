"use client";

import dynamic from "next/dynamic";

export const FlowerCanvas = dynamic(() => import("./FlowerCanvasClient"), {
  ssr: false,
});
