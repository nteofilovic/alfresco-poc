package ch.dmspoc.api.service;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.multipdf.PDFMergerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.function.Function;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;

/**
 * Turns a list of documents in different formats (PDF, images, and anything
 * Alfresco can render to PDF - Word, Excel, PowerPoint...) into a single
 * merged PDF, in the given order.
 *
 * Non-PDF, non-image documents are expected to already have been converted
 * to PDF bytes by the caller (AlfrescoService asks Alfresco's Transform
 * Service for a "pdf" rendition); this class only has to handle PDF and
 * raster images itself.
 */
@Service
public class DocumentMergeService {

    public record SourceDocument(String name, String mimeType, byte[] bytes) {
    }

    public byte[] merge(List<String> nodeIds, Function<String, SourceDocument> fetcher) {
        PDFMergerUtility merger = new PDFMergerUtility();

        try (PDDocument output = new PDDocument()) {
            for (String nodeId : nodeIds) {
                SourceDocument doc = fetcher.apply(nodeId);
                if (doc.mimeType().startsWith("image/")) {
                    appendImagePage(output, doc);
                } else {
                    appendPdfPages(output, merger, doc);
                }
            }

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            output.save(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to merge documents into PDF", e);
        }
    }

    /**
     * Uses PDFMergerUtility.appendDocument() rather than a manual output.importPage() loop:
     * appendDocument deep-clones the source's pages (and their resources, e.g. image XObjects)
     * into the destination document immediately, so it's safe to close the source right after.
     * A plain importPage() only copies references, which go stale once the source is closed -
     * that silently produced blank pages for anything beyond trivial text content.
     */
    private void appendPdfPages(PDDocument output, PDFMergerUtility merger, SourceDocument doc) throws IOException {
        try (PDDocument source = Loader.loadPDF(doc.bytes())) {
            merger.appendDocument(output, source);
        }
    }

    /**
     * Renders every page of a (multi-page) TIFF into a PDF, one page per frame, each page sized to its
     * image. Browsers cannot display TIFF, so the preview endpoint serves this instead.
     */
    public byte[] tiffToPdf(byte[] tiff) throws IOException {
        try (PDDocument pdf = new PDDocument();
             javax.imageio.stream.ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(tiff))) {
            java.util.Iterator<javax.imageio.ImageReader> readers = ImageIO.getImageReaders(in);
            if (!readers.hasNext()) {
                throw new IOException("Unsupported or unreadable TIFF");
            }
            javax.imageio.ImageReader reader = readers.next();
            try {
                reader.setInput(in);
                int pages = reader.getNumImages(true);
                for (int i = 0; i < pages; i++) {
                    BufferedImage image;
                    try {
                        image = reader.read(i);
                    } catch (IOException | RuntimeException e) {
                        continue; // a damaged or non-image frame must not hide the readable ones
                    }
                    PDPage page = new PDPage(new PDRectangle(image.getWidth(), image.getHeight()));
                    pdf.addPage(page);
                    PDImageXObject pdImage = LosslessFactory.createFromImage(pdf, image);
                    try (PDPageContentStream cs = new PDPageContentStream(pdf, page)) {
                        cs.drawImage(pdImage, 0, 0, image.getWidth(), image.getHeight());
                    }
                }
            } finally {
                reader.dispose();
            }
            if (pdf.getNumberOfPages() == 0) {
                throw new IOException("TIFF has no readable pages");
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            pdf.save(out);
            return out.toByteArray();
        }
    }

    /**
     * Draws the image onto a single A4 page, scaled to fit with a small margin, preserving aspect ratio.
     * Decoding goes through ImageIO (with the TwelveMonkeys TIFF plugin on the classpath for scanned
     * TIFF receipts) rather than PDFBox's own format sniffing, so any format ImageIO can read works here.
     * A multi-page TIFF only contributes its first page; splitting those into one page each is a
     * follow-up, not needed for the POC.
     */
    private void appendImagePage(PDDocument output, SourceDocument doc) throws IOException {
        BufferedImage awtImage = ImageIO.read(new ByteArrayInputStream(doc.bytes()));
        if (awtImage == null) {
            throw new IOException("Unsupported or unreadable image: " + doc.name());
        }

        PDPage page = new PDPage(PDRectangle.A4);
        output.addPage(page);

        PDImageXObject pdImage = LosslessFactory.createFromImage(output, awtImage);

        float margin = 36f; // 0.5 inch
        float maxWidth = page.getMediaBox().getWidth() - 2 * margin;
        float maxHeight = page.getMediaBox().getHeight() - 2 * margin;

        float scale = Math.min(maxWidth / pdImage.getWidth(), maxHeight / pdImage.getHeight());
        scale = Math.min(scale, 1f); // never upscale a small image
        float drawWidth = pdImage.getWidth() * scale;
        float drawHeight = pdImage.getHeight() * scale;
        float x = (page.getMediaBox().getWidth() - drawWidth) / 2f;
        float y = (page.getMediaBox().getHeight() - drawHeight) / 2f;

        try (PDPageContentStream cs = new PDPageContentStream(output, page)) {
            cs.drawImage(pdImage, x, y, drawWidth, drawHeight);
        }
    }
}
