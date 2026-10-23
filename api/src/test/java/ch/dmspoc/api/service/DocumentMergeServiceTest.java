package ch.dmspoc.api.service;

import ch.dmspoc.api.service.DocumentMergeService.SourceDocument;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.Test;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DocumentMergeServiceTest {

    private final DocumentMergeService service = new DocumentMergeService();

    // ------------------------------------------------------------------ merge

    @Test
    void mergingNothingGivesAnEmptyPdf() throws IOException {
        byte[] merged = service.merge(List.of(), id -> { throw new AssertionError("nothing to fetch"); });

        assertEquals(0, pageCount(merged));
    }

    @Test
    void pdfsAreAppendedInTheGivenOrder() throws IOException {
        Map<String, SourceDocument> docs = Map.of(
                "a", pdfDoc("a.pdf", 200, 200, 2),
                "b", pdfDoc("b.pdf", 300, 300, 1));

        byte[] merged = service.merge(List.of("b", "a"), docs::get);

        assertEquals(List.of(300f, 200f, 200f), pageWidths(merged));
    }

    @Test
    void theSameDocumentMayBeMergedTwice() throws IOException {
        SourceDocument a = pdfDoc("a.pdf", 200, 200, 1);

        byte[] merged = service.merge(List.of("a", "a"), id -> a);

        assertEquals(2, pageCount(merged));
    }

    @Test
    void theFetcherIsAskedForEveryNodeInOrder() throws IOException {
        List<String> asked = new ArrayList<>();
        SourceDocument doc = pdfDoc("x.pdf", 200, 200, 1);

        service.merge(List.of("n3", "n1", "n2"), id -> {
            asked.add(id);
            return doc;
        });

        assertEquals(List.of("n3", "n1", "n2"), asked);
    }

    @Test
    void anImageBecomesOneA4Page() throws IOException {
        byte[] merged = service.merge(List.of("i"), id -> new SourceDocument("i.png", "image/png", png(100, 50)));

        assertEquals(1, pageCount(merged));
        assertEquals(List.of(PDRectangle.A4.getWidth()), pageWidths(merged));
    }

    @Test
    void jpegAndPngImagesAreBothAccepted() throws IOException {
        Map<String, SourceDocument> docs = Map.of(
                "p", new SourceDocument("p.png", "image/png", png(40, 40)),
                "j", new SourceDocument("j.jpg", "image/jpeg", jpeg(40, 40)));

        assertEquals(2, pageCount(service.merge(List.of("p", "j"), docs::get)));
    }

    @Test
    void aHugeImageIsScaledToFitTheA4Page() throws IOException {
        byte[] merged = service.merge(List.of("i"), id -> new SourceDocument("big.png", "image/png", png(3000, 4000)));

        try (PDDocument doc = Loader.loadPDF(merged)) {
            assertEquals(PDRectangle.A4.getHeight(), doc.getPage(0).getMediaBox().getHeight());
            assertEquals(1, doc.getNumberOfPages());
        }
    }

    @Test
    void aTinyImageStillGetsAFullA4Page() throws IOException {
        byte[] merged = service.merge(List.of("i"), id -> new SourceDocument("dot.png", "image/png", png(1, 1)));

        assertEquals(List.of(PDRectangle.A4.getWidth()), pageWidths(merged));
    }

    @Test
    void mixedFormatsKeepTheirOrder() throws IOException {
        Map<String, SourceDocument> docs = Map.of(
                "p1", pdfDoc("1.pdf", 300, 300, 1),
                "img", new SourceDocument("i.png", "image/png", png(10, 10)),
                "p2", pdfDoc("2.pdf", 400, 400, 1));

        byte[] merged = service.merge(List.of("p1", "img", "p2"), docs::get);

        assertEquals(List.of(300f, PDRectangle.A4.getWidth(), 400f), pageWidths(merged));
    }

    @Test
    void aMultiPageTiffContributesOnlyItsFirstPage() throws IOException {
        byte[] merged = service.merge(List.of("t"), id -> new SourceDocument("scan.tif", "image/tiff", tiff(60, 70, 80)));

        assertEquals(1, pageCount(merged));
    }

    @Test
    void anythingThatIsNotAnImageIsTreatedAsPdf() throws IOException {
        SourceDocument rendered = new SourceDocument("report.docx", "application/octet-stream", pdfBytes(200, 200, 2));

        assertEquals(2, pageCount(service.merge(List.of("r"), id -> rendered)));
    }

    @Test
    void anUnreadableImageIsReportedAsAnIoError() {
        SourceDocument broken = new SourceDocument("broken.png", "image/png", "not an image".getBytes());

        var e = assertThrows(UncheckedIOException.class, () -> service.merge(List.of("x"), id -> broken));

        assertTrue(e.getMessage().contains("merge"));
    }

    @Test
    void anUnreadablePdfIsReportedAsAnIoError() {
        SourceDocument broken = new SourceDocument("broken.pdf", "application/pdf", "nope".getBytes());

        assertThrows(UncheckedIOException.class, () -> service.merge(List.of("x"), id -> broken));
    }

    @Test
    void emptyContentIsReportedAsAnIoError() {
        assertThrows(UncheckedIOException.class,
                () -> service.merge(List.of("x"), id -> new SourceDocument("e.pdf", "application/pdf", new byte[0])));
        assertThrows(UncheckedIOException.class,
                () -> service.merge(List.of("x"), id -> new SourceDocument("e.png", "image/png", new byte[0])));
    }

    @Test
    void aFailingFetchStopsTheMerge() {
        var e = assertThrows(IllegalStateException.class, () -> service.merge(List.of("a", "b"), id -> {
            throw new IllegalStateException("no access to " + id);
        }));

        assertEquals("no access to a", e.getMessage());
    }

    // ------------------------------------------------------------- tiffToPdf

    @Test
    void everyTiffFrameBecomesAPageSizedToItsImage() throws IOException {
        byte[] pdf = service.tiffToPdf(tiff(60, 70, 80));

        assertEquals(List.of(60f, 70f, 80f), pageWidths(pdf));
    }

    @Test
    void aSingleFrameTiffGivesOnePage() throws IOException {
        assertEquals(1, pageCount(service.tiffToPdf(tiff(120))));
    }

    @Test
    void garbageIsNotATiff() {
        var e = assertThrows(IOException.class, () -> service.tiffToPdf("definitely not a tiff".getBytes()));

        assertTrue(e.getMessage().contains("TIFF"));
    }

    @Test
    void emptyBytesAreNotATiff() {
        assertThrows(IOException.class, () -> service.tiffToPdf(new byte[0]));
    }

    @Test
    void anyImageFormatImageIoCanReadConvertsToOnePage() throws IOException {
        // The conversion sniffs the format rather than insisting on TIFF, so a PNG still yields a page.
        assertEquals(List.of(10f), pageWidths(service.tiffToPdf(png(10, 10))));
    }

    // ---------------------------------------------------------------- helpers

    private static int pageCount(byte[] pdf) throws IOException {
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            return doc.getNumberOfPages();
        }
    }

    private static List<Float> pageWidths(byte[] pdf) throws IOException {
        List<Float> widths = new ArrayList<>();
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            for (PDPage page : doc.getPages()) widths.add(page.getMediaBox().getWidth());
        }
        return widths;
    }

    private static SourceDocument pdfDoc(String name, float width, float height, int pages) throws IOException {
        return new SourceDocument(name, "application/pdf", pdfBytes(width, height, pages));
    }

    private static byte[] pdfBytes(float width, float height, int pages) throws IOException {
        try (PDDocument doc = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            for (int i = 0; i < pages; i++) doc.addPage(new PDPage(new PDRectangle(width, height)));
            doc.save(out);
            return out.toByteArray();
        }
    }

    private static BufferedImage image(int width, int height) {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(Color.ORANGE);
        g.fillRect(0, 0, width, height);
        g.dispose();
        return image;
    }

    private static byte[] png(int width, int height) {
        return encode(image(width, height), "png");
    }

    private static byte[] jpeg(int width, int height) {
        return encode(image(width, height), "jpg");
    }

    private static byte[] encode(BufferedImage image, String format) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            assertTrue(ImageIO.write(image, format, out), "no ImageIO writer for " + format);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out.toByteArray();
    }

    /** A multi-frame TIFF with one frame per given width (all 50 px high). */
    private static byte[] tiff(int... widths) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ImageOutputStream ios = ImageIO.createImageOutputStream(out)) {
            ImageWriter writer = ImageIO.getImageWritersByFormatName("tiff").next();
            try {
                writer.setOutput(ios);
                writer.prepareWriteSequence(null);
                for (int width : widths) writer.writeToSequence(new IIOImage(image(width, 50), null, null), null);
                writer.endWriteSequence();
            } finally {
                writer.dispose();
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out.toByteArray();
    }
}
