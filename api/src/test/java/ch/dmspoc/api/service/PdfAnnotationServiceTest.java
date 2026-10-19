package ch.dmspoc.api.service;

import ch.dmspoc.api.exception.RequestRejectedException;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
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

    private static byte[] pdf(int pages) throws IOException {
        try (PDDocument doc = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            for (int i = 0; i < pages; i++) doc.addPage(new PDPage());
            doc.save(out);
            return out.toByteArray();
        }
    }
}
