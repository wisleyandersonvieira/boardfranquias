import jsPDF from "jspdf";

// Cache the logo base64 to avoid re-fetching
let logoBase64Cache: string | null = null;

const loadLogoBase64 = async (): Promise<string | null> => {
  if (logoBase64Cache) return logoBase64Cache;

  try {
    // Dynamically import the logo asset to get the bundled URL
    const logoModule = await import("@/assets/board-sistemas-text-logo.png");
    const logoUrl = logoModule.default;

    const response = await fetch(logoUrl);
    const blob = await response.blob();

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        logoBase64Cache = reader.result as string;
        resolve(logoBase64Cache);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Error loading logo for PDF:", error);
    return null;
  }
};

/**
 * Adds a standard header to a jsPDF document with the report title centered
 * and the Board Sistemas logo on the right, followed by a horizontal line.
 *
 * @param pdf - The jsPDF instance
 * @param title - The report title
 * @returns The Y position after the header (to start content below)
 */
export const addPdfHeader = async (pdf: jsPDF): Promise<void> => {
  // no-op load, just ensures cache is warm
  await loadLogoBase64();
};

/**
 * Renders the PDF header synchronously (call after warming the cache with addPdfHeader).
 * Returns the Y coordinate where content should start.
 */
export const renderPdfHeader = (pdf: jsPDF, title: string): number => {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const logoHeight = 12;
  const logoWidth = 40; // aspect ratio ~3.3:1
  const marginRight = 14;
  const headerY = 10;

  // Draw report title centered
  pdf.setFontSize(14);
  pdf.setFont("helvetica", "bold");
  pdf.text(title, pageWidth / 2, headerY + logoHeight / 2 + 2, { align: "center" });

  // Draw logo on the right
  if (logoBase64Cache) {
    try {
      pdf.addImage(
        logoBase64Cache,
        "PNG",
        pageWidth - logoWidth - marginRight,
        headerY,
        logoWidth,
        logoHeight
      );
    } catch (e) {
      console.error("Error adding logo to PDF:", e);
    }
  }

  // Draw separator line
  const lineY = headerY + logoHeight + 4;
  pdf.setDrawColor(59, 130, 246); // blue-500
  pdf.setLineWidth(0.5);
  pdf.line(14, lineY, pageWidth - 14, lineY);

  // Reset font
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");

  return lineY + 8;
};

/**
 * Convenience: warms logo cache + renders header. Use in async export functions.
 */
export const addPdfHeaderWithLogo = async (pdf: jsPDF, title: string): Promise<number> => {
  await loadLogoBase64();
  return renderPdfHeader(pdf, title);
};
