import jsPDF from "jspdf";

let logoBase64Cache: string | null = null;
let textLogoBase64Cache: string | null = null;

const loadImageFromImport = async (importFn: () => Promise<any>): Promise<string | null> => {
  try {
    const mod = await importFn();
    const response = await fetch(mod.default);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

const loadImageFromUrl = async (url: string): Promise<string | null> => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

const TEXT_LOGO_URL = "https://odmqiojfqmqauzedaosa.supabase.co/storage/v1/object/public/logo/Logo_texto.png";

const warmCache = async () => {
  if (!logoBase64Cache) {
    logoBase64Cache = await loadImageFromImport(() => import("@/assets/board-sistemas-logo.png"));
  }
  if (!textLogoBase64Cache) {
    textLogoBase64Cache = await loadImageFromUrl(TEXT_LOGO_URL);
  }
};

/**
 * Adds a standard PDF header:
 * - Left: board-sistemas-logo.png (square icon)
 * - Center: report title
 * - Right: board-sistemas-text-logo.png
 * - Blue separator line below
 *
 * Returns the Y coordinate where content should start.
 */
export const addPdfHeaderWithLogo = async (pdf: jsPDF, title: string): Promise<number> => {
  await warmCache();

  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 14;
  const headerY = 8;

  // Left logo (square ~1:1 aspect ratio) 
  const leftLogoSize = 14;
  if (logoBase64Cache) {
    try {
      pdf.addImage(logoBase64Cache, "PNG", margin, headerY, leftLogoSize, leftLogoSize);
    } catch (e) {
      console.error("Error adding left logo:", e);
    }
  }

  // Right text logo (~3.3:1 aspect ratio)
  const rightLogoH = 10;
  const rightLogoW = 26.4;
  if (textLogoBase64Cache) {
    try {
      pdf.addImage(
        textLogoBase64Cache,
        "PNG",
        pageWidth - rightLogoW - margin,
        headerY + (leftLogoSize - rightLogoH) / 2,
        rightLogoW,
        rightLogoH
      );
    } catch (e) {
      console.error("Error adding right logo:", e);
    }
  }

  // Title centered
  pdf.setFontSize(13);
  pdf.setFont("helvetica", "bold");
  pdf.text(title, pageWidth / 2, headerY + leftLogoSize / 2 + 1.5, { align: "center" });

  // Separator line
  const lineY = headerY + leftLogoSize + 3;
  pdf.setDrawColor(59, 130, 246);
  pdf.setLineWidth(0.5);
  pdf.line(margin, lineY, pageWidth - margin, lineY);

  // Reset font
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");

  return lineY + 6;
};
