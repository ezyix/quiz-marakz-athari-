"use client";

import Image from "next/image";

export default function StudyPdfViewer() {
  return (
    <div className="study-pdf-document">
      <div className="study-material-pages" role="region" aria-label="Study material pages">
        <Image
          className="study-material-page"
          src="/image-2.png"
          alt="Study material page 1"
          width={367}
          height={519}
          sizes="(max-width: 452px) calc(100vw - 42px), 420px"
          loading="eager"
        />
        <Image
          className="study-material-page"
          src="/image-1.png"
          alt="Study material page 2"
          width={367}
          height={519}
          sizes="(max-width: 452px) calc(100vw - 42px), 420px"
        />
        <Image
          className="study-material-page"
          src="/image-3.png"
          alt="Study material page 3"
          width={367}
          height={519}
          sizes="(max-width: 452px) calc(100vw - 42px), 420px"
        />
      </div>
    </div>
  );
}
