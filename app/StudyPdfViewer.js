"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export default function StudyPdfViewer() {
  const viewerRef = useRef(null);
  const [pageWidth, setPageWidth] = useState(0);
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    const viewer = viewerRef.current;

    if (!viewer) {
      return undefined;
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      setPageWidth(Math.min(420, Math.floor(entry.contentRect.width - 24)));
    });

    resizeObserver.observe(viewer);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div className="study-pdf-document" ref={viewerRef}>
      <Document
        className="study-pdf-pages"
        file="/Fathiha.pdf"
        onLoadSuccess={({ numPages }) => setPageCount(numPages)}
        loading={<p className="study-pdf-message">Loading PDF pages…</p>}
        error={
          <p className="study-pdf-message" role="alert">
            Unable to display the PDF here.{" "}
            <a href="/Fathiha.pdf" target="_blank" rel="noreferrer">
              Open the PDF directly
            </a>
            .
          </p>
        }
      >
        {pageWidth > 0 &&
          Array.from({ length: pageCount }, (_, index) => (
            <Page
              key={index + 1}
              pageNumber={index + 1}
              width={pageWidth}
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />
          ))}
      </Document>
    </div>
  );
}
