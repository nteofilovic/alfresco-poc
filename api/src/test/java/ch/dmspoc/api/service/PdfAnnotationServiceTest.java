package ch.dmspoc.api.service;

import ch.dmspoc.api.exception.RequestRejectedException;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;

class PdfAnnotationServiceTest {

    private final PdfAnnotationService service = new PdfAnnotationService();

    @Test
    void acceptsSamePageCount() throws IOException {
        assertDoesNotThrow(() -> service.validate(pdf(2), pdf(2)));
    }

    @Test
    void rejectsDifferentPageCount() throws IOException {
        var e = assertThrows(RequestRejectedException.class, () -> service.validate(pdf(2), pdf(3)));
        assertEquals(422, e.getStatus());
    }

    @Test
    void rejectsGarbage() throws IOException {
        var e = assertThrows(RequestRejectedException.class, () -> service.validate(pdf(1), "nope".getBytes()));
        assertEquals(422, e.getStatus());
    }

    @Test
    void addsStickyNoteAsTextAnnotationAtTheClickedPoint() throws IOException {
        byte[] result = service.addNotes(pdf(1), java.util.List.of(new ch.dmspoc.api.dto.StickyNote(1, 0.5, 0.25, "Check this", "#4fd1c5")), "admin");
        try (PDDocument doc = org.apache.pdfbox.Loader.loadPDF(result)) {
            var annotations = doc.getPage(0).getAnnotations();
            assertEquals(1, annotations.size());
            var note = (org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationText) annotations.get(0);
            assertEquals("Check this", note.getContents());
            assertEquals("admin", note.getTitlePopup());
            assertEquals(0x4f / 255f, note.getColor().getComponents()[0], 0.01f);
            // A4-ish default page is 612x792: x = 50%, icon top at 75% of the height from the bottom.
            assertEquals(306f, note.getRectangle().getLowerLeftX(), 0.5f);
            assertEquals(594f, note.getRectangle().getUpperRightY(), 0.5f);
        }
    }

    @Test
    void rejectsNoteOnMissingPage()throws IOException {
        var e = assertThrows(RequestRejectedException.class,
                () -> service.addNotes(pdf(1), java.util.List.of(new ch.dmspoc.api.dto.StickyNote(3, 0.1, 0.1, "x", null)), "admin"));
        assertEquals(422, e.getStatus());
    }

    @Test
    void noNotesReturnTheSameBytesUntouched() throws IOException {
        byte[] original = pdf(1);

        assertSame(original, service.addNotes(original, null, "admin"));
        assertSame(original, service.addNotes(original, java.util.List.of(), "admin"));
    }

    @Test
    void aNoteWithoutColorIsYellowAndWithoutAuthorHasNoTitle() throws IOException {
        byte[] result = service.addNotes(pdf(1), java.util.List.of(new ch.dmspoc.api.dto.StickyNote(1, 0.1, 0.1, "x", null)), null);

        try (PDDocument doc = org.apache.pdfbox.Loader.loadPDF(result)) {
            var note = (org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationText) doc.getPage(0).getAnnotations().get(0);
            assertEquals(1f, note.getColor().getComponents()[0], 0.01f);
            assertEquals(0.85f, note.getColor().getComponents()[1], 0.01f);
            assertEquals(0.2f, note.getColor().getComponents()[2], 0.01f);
            assertNull(note.getTitlePopup());
        }
    }

    @Test
    void notesLandOnTheirOwnPagesAndStack() throws IOException {
        var notes = java.util.List.of(
                new ch.dmspoc.api.dto.StickyNote(1, 0.1, 0.1, "a", null),
                new ch.dmspoc.api.dto.StickyNote(2, 0.2, 0.2, "b", null),
                new ch.dmspoc.api.dto.StickyNote(2, 0.3, 0.3, "c", null));

        try (PDDocument doc = org.apache.pdfbox.Loader.loadPDF(service.addNotes(pdf(2), notes, "admin"))) {
            assertEquals(1, doc.getPage(0).getAnnotations().size());
            assertEquals(2, doc.getPage(1).getAnnotations().size());
        }
    }

    @Test
    void notesCanBeAddedToAPdfThatAlreadyHasAnnotations() throws IOException {
        byte[] once = service.addNotes(pdf(1), java.util.List.of(new ch.dmspoc.api.dto.StickyNote(1, 0.1, 0.1, "first", null)), "admin");

        byte[] twice = service.addNotes(once, java.util.List.of(new ch.dmspoc.api.dto.StickyNote(1, 0.5, 0.5, "second", null)), "admin");

        try (PDDocument doc = org.apache.pdfbox.Loader.loadPDF(twice)) {
            assertEquals(2, doc.getPage(0).getAnnotations().size());
        }
    }

    @Test
    void notesOnAnUnreadablePdfAreRejected() {
        var e = assertThrows(RequestRejectedException.class,
                () -> service.addNotes("nope".getBytes(), java.util.List.of(new ch.dmspoc.api.dto.StickyNote(1, 0.1, 0.1, "x", null)), "admin"));

        assertEquals(422, e.getStatus());
    }

    @Test
    void validatingAgainstAnUnreadableOriginalIsRejected() throws IOException {
        assertEquals(422, assertThrows(RequestRejectedException.class, () -> service.validate("nope".getBytes(), pdf(1))).getStatus());
        assertEquals(422, assertThrows(RequestRejectedException.class, () -> service.validate(pdf(1), new byte[0])).getStatus());
    }

    @Test
    void colorsAreParsedFromHex() {
        assertArrayEquals(new float[]{1f, 0f, 0f}, PdfAnnotationService.rgb("#ff0000"), 0.001f);
        assertArrayEquals(new float[]{0f, 0f, 1f}, PdfAnnotationService.rgb("#0000FF"), 0.001f);
        assertArrayEquals(new float[]{1f, 0.85f, 0.2f}, PdfAnnotationService.rgb(null), 0.001f);
    }

    @Test
    void thePointIsMappedForEveryPageRotation() {
        PDPage page = new PDPage(); // 612 x 792
        assertArrayEquals(new float[]{153f, 396f}, PdfAnnotationService.toUserSpace(page, 0.25, 0.5), 0.5f);

        page.setRotation(90);
        assertArrayEquals(new float[]{306f, 198f}, PdfAnnotationService.toUserSpace(page, 0.25, 0.5), 0.5f);

        page.setRotation(180);
        assertArrayEquals(new float[]{459f, 396f}, PdfAnnotationService.toUserSpace(page, 0.25, 0.5), 0.5f);

        page.setRotation(270);
        assertArrayEquals(new float[]{306f, 594f}, PdfAnnotationService.toUserSpace(page, 0.25, 0.5), 0.5f);
    }

    @Test
    void aNegativeRotationCountsAsItsPositiveEquivalent() {
        PDPage page = new PDPage();
        page.setRotation(-90);
        PDPage other = new PDPage();
        other.setRotation(270);

        assertArrayEquals(PdfAnnotationService.toUserSpace(other, 0.3, 0.6), PdfAnnotationService.toUserSpace(page, 0.3, 0.6), 0.001f);
    }

    @Test
    void theIconIsKeptInsideThePage() {
        PDPage page = new PDPage();

        float[] bottomRight = PdfAnnotationService.toUserSpace(page, 1, 1);
        float[] topLeft = PdfAnnotationService.toUserSpace(page, 0, 0);

        assertEquals(592f, bottomRight[0], 0.5f); // right edge minus the icon width
        assertEquals(20f, bottomRight[1], 0.5f);  // bottom edge plus the icon height (the icon hangs from its top)
        assertEquals(0f, topLeft[0], 0.5f);
        assertEquals(792f, topLeft[1], 0.5f);
    }

    @Test
    void theCropBoxIsRespected() {
        PDPage page = new PDPage();
        page.setCropBox(new org.apache.pdfbox.pdmodel.common.PDRectangle(100, 200, 300, 400));

        float[] origin = PdfAnnotationService.toUserSpace(page, 0, 1);

        assertEquals(100f, origin[0], 0.5f);
        assertEquals(220f, origin[1], 0.5f);
    }

    private static byte[] pdf(int pages) throws IOException {
        try (PDDocument doc = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            for (int i = 0; i < pages; i++) doc.addPage(new PDPage());
            doc.save(out);
            return out.toByteArray();
        }
    }
}
